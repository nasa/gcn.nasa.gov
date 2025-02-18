import { DynamoDBClient, paginateScan } from '@aws-sdk/client-dynamodb'
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

export async function backfillSlugsOnSynonyms() {
  const startTime = new Date()
  console.log('Starting SYNONYM SLUG backfill... ', startTime)
  const dynamoTableName = '/RemixGcnProduction/tables/synonyms'
  const TableName = await getTableNameFromSSM(dynamoTableName)
  const client = new DynamoDBClient({ region: 'us-east-1' })
  const pages = paginateScan({ client }, { TableName })

  for await (const page of pages) {
    const chunked = [...chunks(page.Items || [], 25)]
    const synonymsToUpdate = []
    for (const chunk of chunked) {
      for (const record of chunk) {
        const synonym = unmarshall(record)
        if (!synonym.slug) {
          synonymsToUpdate.push(synonym)
        }
      }
      if (synonymsToUpdate.length > 0) {
        const command = new BatchWriteCommand({
          RequestItems: {
            [TableName]: synonymsToUpdate.map((synonym) => ({
              PutRequest: {
                Item: {
                  synonymId: synonym.synonymId,
                  eventId: synonym.eventId,
                  slug: slug(synonym.eventId),
                },
              },
            })),
          },
        })
        await client.send(command)
        console.log(`updated ${synonymsToUpdate.length} records`)
      }
    }
  }
  const endTime = new Date()
  console.log('... End SYNONYM SLUG backfill... ', endTime)
}

backfillSlugsOnSynonyms()
