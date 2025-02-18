import {
  BatchGetItemCommand,
  DynamoDBClient,
  paginateScan,
} from '@aws-sdk/client-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { slug } from 'github-slugger'

function* chunks(arr, n) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n)
  }
}

async function getTableNameFromSSM(dynamoTableName) {
  const ssmClient = new SSMClient({ region: 'us-east-1' })

  try {
    const command = new GetParameterCommand({ Name: dynamoTableName })
    const response = await ssmClient.send(command)

    if (!response.Parameter?.Value) {
      throw new Error('dynamoTableName not found in SSM')
    }

    return response.Parameter.Value
  } catch (error) {
    console.error('Error fetching table name from SSM:', error)
    throw error
  }
}

export async function backfillSynonyms() {
  const startTime = new Date()
  console.log('Starting SYNONYM backfill...', startTime)
  const dynamoCircularsTableName = '/RemixGcnProduction/tables/circulars'
  const circularTableName = await getTableNameFromSSM(dynamoCircularsTableName)
  const dynamoSynonymsTableName = '/RemixGcnProduction/tables/synonyms'
  const TableName = await getTableNameFromSSM(dynamoSynonymsTableName)
  const client = new DynamoDBClient({ region: 'us-east-1' })
  const pages = paginateScan({ client }, { TableName: circularTableName })
  let totalWritten = 0
  let pageCount = 0

  for await (const page of pages) {
    pageCount += 1
    console.log(`Page ${pageCount} of ${pages.length}`)
    const chunked = [...chunks(page.Items || [], 25)]
    for (const chunk of chunked) {
      const eventsToCheck = []
      const existingEventIds = []
      for (const record of chunk) {
        const circular = unmarshall(record)
        if (circular.eventId) {
          if (!eventsToCheck.includes(circular.eventId))
            eventsToCheck.push(circular.eventId)
        }
      }
      try {
        if (eventsToCheck > 0) {
          const command = new BatchGetItemCommand({
            RequestItems: {
              [TableName]: {
                Keys: [
                  ...eventsToCheck.map((eventId) => {
                    return { eventId: { S: eventId } }
                  }),
                ],
              },
            },
          })
          const response = await client.send(command)
          if (response.Responses) {
            response.Responses[TableName].forEach(function (element) {
              if (element.eventId?.S) existingEventIds.push(element.eventId.S)
            })
          }
        }
      } catch (error) {
        if (error.name !== 'ResourceNotFoundException') throw error
        console.error('Error in BatchGetItemCommand:', error)
      }

      const eventsToCreate = eventsToCheck.filter(
        (item) => !existingEventIds.includes(item)
      )

      if (eventsToCreate.length > 0) {
        const command = new BatchWriteCommand({
          RequestItems: {
            [TableName]: eventsToCreate.map((eventId) => ({
              PutRequest: {
                Item: {
                  synonymId: crypto.randomUUID(),
                  eventId,
                  slug: slug(eventId),
                },
              },
            })),
          },
        })
        await client.send(command)
        totalWritten += eventsToCreate.length
      }
    }
  }
  const endTime = new Date()
  console.log('... End SYNONYM backfill... ', endTime)
  console.log('Total written: ', totalWritten)
}

backfillSynonyms()
