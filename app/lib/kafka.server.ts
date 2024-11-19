/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { tables } from '@architect/functions'
import { paginateScan } from '@aws-sdk/lib-dynamodb'
import type { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import crypto from 'crypto'
import { Kafka } from 'gcn-kafka'
import type { AclEntry } from 'kafkajs'
import {
  AclOperationTypes,
  AclPermissionTypes,
  AclResourceTypes,
  ResourcePatternTypes,
} from 'kafkajs'
import memoizee from 'memoizee'

import { domain, getEnvOrDieInProduction } from './env.server'
import type { User } from '~/routes/_auth/user.server'

const client_id = getEnvOrDieInProduction('KAFKA_CLIENT_ID') ?? ''
const client_secret = getEnvOrDieInProduction('KAFKA_CLIENT_SECRET')
const kafka = new Kafka({
  client_id,
  client_secret,
  domain,
})

export let send: (topic: string, value: string) => Promise<void>

// FIXME: A single AWS Lambda execution environment can handle multiple
// invocations; AWS sends the runtime SIGTERM when it is time to shut down.
// However, @architect/sandbox does not properly simulate this behavior when it
// invokes a Lambda; rather than returning control after the Lambda handler
// returns, @architect/sandbox hangs until the Node.js runtime process
// terminates, or a timeout is reached, and then apparently kills the runtime
// process ungracefully. This is a problem if there are resources that are
// initialized during the invocation that have unsettled promises in the
// background that keep the Node.js runtime's event loop going.
//
// On AWS Lambda, we leave the Kafka connection open so that it is reused over
// multiple invocations and we register a beforeExit event handler to close it
// when the runtime is gracefully shutting down. However, until the above issue
// is fixed in @architect/sandbox, we need a separate code path for local
// testing.
if (process.env.ARC_SANDBOX) {
  send = async (topic, value) => {
    const producer = kafka.producer()
    await producer.connect()
    try {
      await producer.send({ topic, messages: [{ value }] })
    } finally {
      await producer.disconnect()
    }
  }
} else {
  // FIXME: remove memoizee and use top-level await once we switch to ESM builds.
  const getProducer = memoizee(
    async () => {
      const producer = kafka.producer()
      await producer.connect()
      ;['SIGINT', 'SIGTERM'].forEach((event) =>
        process.once(event, async () => {
          console.log('Disconnecting from Kafka')
          await producer.disconnect()
          console.log('Disconnected from Kafka')
        })
      )
      return producer
    },
    { promise: true }
  )

  send = async (topic, value) => {
    const producer = await getProducer()
    await producer.send({ topic, messages: [{ value }] })
  }
}

export type KafkaACL = AclEntry & {
  aclId?: string
}

export type UserClientType = 'producer' | 'consumer'

export const adminGroup = 'gcn.nasa.gov/gcn-admin'

export const consumerOperations = [
  AclOperationTypes.READ,
  AclOperationTypes.DESCRIBE,
]
export const producerOperations = [
  AclOperationTypes.CREATE,
  AclOperationTypes.WRITE,
  AclOperationTypes.DESCRIBE,
]

const admin_client_id = getEnvOrDieInProduction('KAFKA_ADMIN_CLIENT_ID') ?? ''
const admin_client_secret = getEnvOrDieInProduction('KAFKA_ADMIN_CLIENT_SECRET')
const adminKafka = new Kafka({
  client_id: admin_client_id,
  client_secret: admin_client_secret,
  domain,
})

function validateUser(user: User) {
  if (!user.groups.includes(adminGroup))
    throw new Response(null, { status: 403 })
}

export async function getKafkaACLsFromDynamoDB(user: User, filter?: string) {
  validateUser(user)
  const db = await tables()
  const client = db._doc as unknown as DynamoDBDocument
  const TableName = db.name('kafka_acls')
  const pages = paginateScan(
    { client },
    {
      TableName,
      FilterExpression: filter
        ? 'contains(resourceName, :filter) OR contains(cognitoGroup, :filter)'
        : undefined,
      ExpressionAttributeValues: filter
        ? {
            ':filter': filter,
          }
        : undefined,
    }
  )

  const acls: KafkaACL[] = []
  for await (const page of pages) {
    const newACL = page.Items as KafkaACL[]
    if (newACL) acls.push(...newACL)
  }
  return acls
}

export async function getAclsFromBrokers() {
  const adminClient = adminKafka.admin()
  await adminClient.connect()
  const acls = await adminClient.describeAcls({
    resourceType: AclResourceTypes.ANY,
    host: '*',
    permissionType: AclPermissionTypes.ANY,
    operation: AclOperationTypes.ANY,
    resourcePatternType: ResourcePatternTypes.ANY,
  })
  await adminClient.disconnect()

  const results: KafkaACL[] = []
  for (const item of acls.resources) {
    results.push(
      ...item.acls.map((acl) => {
        return {
          ...acl,
          resourceName: item.resourceName,
          resourceType: item.resourceType,
          resourcePatternType: item.resourcePatternType,
        }
      })
    )
  }

  return results
}

export async function updateDbFromBrokers(user: User) {
  const kafkaDefinedAcls = await getAclsFromBrokers()
  const db = await tables()
  await Promise.all([
    ...kafkaDefinedAcls.map((acl) =>
      db.kafka_acls.put({ ...acl, aclId: crypto.randomUUID() })
    ),
    db.kafka_acl_log.put({
      partitionKey: 1,
      syncedOn: Date.now(),
      syncedBy: user.email,
    }),
  ])
}

type KafkaAclSyncLog = {
  partitionKey: number
  syncedOn: number
  syncedBy: string
}

export async function getLastSyncDate(): Promise<KafkaAclSyncLog> {
  const db = await tables()
  return (
    await db.kafka_acl_log.query({
      KeyConditionExpression: 'partitionKey = :1',
      ExpressionAttributeValues: { ':1': 1 },
      ScanIndexForward: false,
      Limit: 1,
    })
  ).Items.pop() as KafkaAclSyncLog
}
