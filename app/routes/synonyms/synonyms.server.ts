/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { tables } from '@architect/functions'
import { type DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { search as getSearchClient } from '@nasa-gcn/architect-functions-search'
import crypto from 'crypto'
import { slug } from 'github-slugger'

import type { Circular } from '../circulars/circulars.lib'
import type {
  Synonym,
  SynonymGroup,
  SynonymGroupWithMembers,
} from './synonyms.lib'

export async function getSynonymsByUuid(synonymId: string) {
  const db = await tables()
  const { Items } = await db.synonyms.query({
    IndexName: 'synonymsByUuid',
    KeyConditionExpression: 'synonymId = :synonymId',
    ExpressionAttributeValues: {
      ':synonymId': synonymId,
    },
  })

  return Items as Synonym[]
}

export async function getSynonymsBySlug(slug: string) {
  const db = await tables()
  const { Items } = await db.synonyms.query({
    IndexName: 'synonymsBySlug',
    KeyConditionExpression: 'slug = :slug',
    ExpressionAttributeValues: {
      ':slug': slug,
    },
  })
  const synonym = Items[0]
  return getSynonymsByUuid(synonym.synonymId)
}

export async function searchSynonymsByEventId({
  limit = 10,
  page,
  eventId,
}: {
  limit?: number
  page: number
  eventId?: string
}): Promise<{
  items: SynonymGroup[]
  totalItems: number
  totalPages: number
  page: number
}> {
  const client = await getSearchClient()
  const query: any = {
    bool: {
      should: [
        {
          match_all: {},
        },
      ],
      minimum_should_match: 1,
    },
  }

  if (eventId) {
    query.bool.should.push({
      match: {
        eventIds: {
          query: eventId,
          fuzziness: '1',
        },
      },
    })
  }

  const {
    body: {
      hits: {
        total: { value: totalItems },
        hits,
      },
    },
  } = await client.search({
    index: 'synonym-groups',
    from: page * limit,
    size: limit,
    body: {
      query,
    },
  })

  const totalPages: number = Math.ceil(totalItems / limit)
  const results = hits.map(
    ({
      _source: body,
    }: {
      _source: SynonymGroup
      fields: { eventIds: string[]; synonymId: string; slugs: string[] }
    }) => body
  )
  return {
    items: results,
    totalItems,
    totalPages,
    page,
  }
}

async function validateEventIds({ eventIds }: { eventIds: string[] }) {
  const promises = eventIds.map((eventId) => {
    return getSynonymMembers(eventId)
  })

  const validityResponse = await Promise.all(promises)
  const filteredResponses = validityResponse.filter((resp) => {
    return resp.length
  })

  return filteredResponses.length === eventIds.length
}

/*
 * If an eventId already has a synonym and is passed in, it will unlink the
 * eventId from the old synonym and the only remaining link will be to the
 * new synonym.
 *
 * BatchWriteItem has a limit of 25 items, so the user may not add more than
 * 25 synonyms at a time.
 */
export async function moderatorCreateSynonyms(synonymousEventIds: string[]) {
  if (!synonymousEventIds.length) {
    throw new Response('EventIds are required.', { status: 400 })
  }
  const uuid = crypto.randomUUID()
  const db = await tables()
  const client = db._doc as unknown as DynamoDBDocument
  const TableName = db.name('synonyms')
  const isValid = await validateEventIds({ eventIds: synonymousEventIds })
  if (!isValid) throw new Response('eventId does not exist', { status: 400 })

  await client.batchWrite({
    RequestItems: {
      [TableName]: synonymousEventIds.map((eventId) => ({
        PutRequest: {
          Item: { synonymId: uuid, eventId, slug: slug(eventId) },
        },
      })),
    },
  })
  return uuid
}

export async function tryInitSynonym(eventId: string) {
  const db = await tables()

  try {
    await db.synonyms.update({
      Key: { eventId },
      UpdateExpression: 'set #synonymId = :synonymId, #slug = :slug',
      ExpressionAttributeNames: {
        '#synonymId': 'synonymId',
        '#slug': 'slug',
      },
      ExpressionAttributeValues: {
        ':synonymId': crypto.randomUUID(),
        ':slug': slug(eventId),
      },
      ConditionExpression: 'attribute_not_exists(eventId)',
    })
  } catch (error) {
    if ((error as Error).name !== 'ConditionalCheckFailedException') throw error
  }
}

/*
 * If an eventId already has a synonym and is passed in, it will unlink the
 * eventId from the old synonym and the only remaining link will be to the
 * new synonym.
 *
 * BatchWriteItem has a limit of 25 items, so the user may not add and/or remove
 *  more than 25 synonyms at a time.
 */
export async function putSynonyms({
  synonymId,
  additions,
  subtractions,
}: {
  synonymId: string
  additions?: string[]
  subtractions?: string[]
}) {
  if (!subtractions?.length && !additions?.length) return
  if (additions?.length) {
    const isValid = await validateEventIds({ eventIds: additions })
    if (!isValid) throw new Response('eventId does not exist', { status: 400 })
  }
  const db = await tables()
  const client = db._doc as unknown as DynamoDBDocument
  const TableName = db.name('synonyms')
  const writes = []
  if (subtractions?.length) {
    const subtraction_writes = subtractions.map((eventId) => ({
      PutRequest: {
        Item: { synonymId: crypto.randomUUID(), eventId, slug: slug(eventId) },
      },
    }))

    writes.push(...subtraction_writes)
  }
  if (additions?.length) {
    const addition_writes = additions.map((eventId) => ({
      PutRequest: {
        Item: { synonymId, eventId, slug: slug(eventId) },
      },
    }))
    writes.push(...addition_writes)
  }
  const params = {
    RequestItems: {
      [TableName]: writes,
    },
  }
  await client.batchWrite(params)
}

/*
 * BatchWriteItem has a limit of 25 items, so the user may not delete
 *  more than 25 synonyms at a time.
 */
export async function deleteSynonyms(synonymId: string) {
  const db = await tables()
  const client = db._doc as unknown as DynamoDBDocument
  const TableName = db.name('synonyms')
  const results = await db.synonyms.query({
    IndexName: 'synonymsByUuid',
    KeyConditionExpression: 'synonymId = :synonymId',
    ProjectionExpression: 'eventId',
    ExpressionAttributeValues: {
      ':synonymId': synonymId,
    },
  })

  const writes = results.Items.map(({ eventId }) => ({
    PutRequest: {
      Item: { synonymId: crypto.randomUUID(), eventId },
    },
  }))
  const params = {
    RequestItems: {
      [TableName]: writes,
    },
  }
  await client.batchWrite(params)
}

export async function autoCompleteEventIds({
  query,
}: {
  query: string
}): Promise<{
  options: string[]
}> {
  const cleanedQuery = query.replace('-', ' ')
  const client = await getSearchClient()
  const {
    body: {
      hits: { hits },
    },
  } = await client.search({
    index: 'circulars',
    body: {
      query: {
        bool: {
          must: [
            {
              query_string: {
                query: `*${cleanedQuery}*`,
                fields: ['eventId'],
                fuzziness: 'AUTO',
              },
            },
          ],
        },
      },
      fields: ['eventId'],
      _source: false,
      from: 0,
      size: 10,
      track_total_hits: true,
    },
  })
  const options = hits.map(
    ({
      fields: {
        eventId: [eventId],
      },
    }: {
      _id: string
      fields: { eventId: string }
    }) => eventId
  )

  return { options }
}

export async function groupMembersByEventId({
  limit = 10,
  page,
  eventId,
  query,
}: {
  limit?: number
  page: number
  eventId?: string
  query?: string
}): Promise<{
  items: SynonymGroupWithMembers[]
  totalItems: number
  totalPages: number
}> {
  const searchTerm = eventId || query
  const searchResults = await searchSynonymsByEventId({
    limit,
    page,
    eventId: searchTerm,
  })
  const groupedItems = searchResults.items.map(async (group) => {
    const promises = group.eventIds.map((eventId) => getSynonymMembers(eventId))
    const members = (await Promise.all(promises)).flat()
    return { ...group, members }
  })
  const items = (await Promise.all(groupedItems)).sort(
    (a, b) => b.members[0].createdOn - a.members[0].createdOn
  )

  return {
    items,
    totalItems: searchResults.totalItems,
    totalPages: searchResults.totalPages,
  }
}

async function getSynonymMembers(eventId: string) {
  const db = await tables()
  const Items: Circular[] = (
    await db.circulars.query({
      IndexName: 'circularsByEventId',
      KeyConditionExpression: 'eventId = :eventId',
      ExpressionAttributeValues: {
        ':eventId': eventId,
      },
    })
  ).Items

  Items.sort((a, b) => b.createdOn - a.createdOn)

  return Items
}

export async function getAllSynonymMembers(eventIds: string[]) {
  const promises = eventIds.map(getSynonymMembers)
  const results = (await Promise.all(promises)).flat()
  return results
}
