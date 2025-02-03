import { DynamoDBClient, paginateScan } from '@aws-sdk/client-dynamodb'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

// THIS CODE IS CUT AND PASTED FROM THE APP CODE IN /routes/circulars/circulars.lib.ts
// running as a node script it would not import the module from the file
const subjectMatchers = [
  [/GRB[.\s_-]*(\d{6}[a-z|.]\d*)/i, ([, id]) => `GRB ${id.toUpperCase()}`],
  [/SGR[.\s_-]*(J*\d{4}\.?\d*\+\d{4})/i, ([, id]) => `SGR ${id.toUpperCase()}`],
  [
    /SGR[.\s_-]*Swift[.\s_-]*(J*\d{4}\.?\d*\+\d{4})/i,
    ([, id]) => `SGR Swift ${id.toUpperCase()}`,
  ],
  [/IceCube[.\s_-]*(\d{6}[a-z])/i, ([, id]) => `IceCube-${id.toUpperCase()}`],
  [/ZTF[.\s_-]*(\d{2}[a-z]*)/i, ([, id]) => `ZTF${id.toLowerCase()}`],
  [/HAWC[.\s_-]*(\d{6}A)/i, ([, id]) => `HAWC-${id.toUpperCase()}`],
  [
    /((?:LIGO|Virgo|KAGRA)(?:[/-](?:LIGO|Virgo|KAGRA))*)[-_ \s]?(S|G|GW)(\d{5,}[a-z]*)/i,
    ([, instrument, flag, id]) => {
      return `${instrument} ${flag.toUpperCase()}${id.toLowerCase()}`
    },
  ],
  [/ANTARES[.\s_-]*(\d{6}[a-z])/i, ([, id]) => `ANTARES ${id}`.toUpperCase()],
  [
    /Baksan\sNeutrino\sObservatory\sAlert[.\s_-]*(\d{6}.\d{2})/i,
    ([, id]) => `Baksan Neutrino Observatory Alert ${id}`,
  ],
  [/EP[.\s_-]*(\d{6}[a-z])/i, ([, id]) => `EP${id}`],
]

export function parseEventFromSubject(value) {
  for (const [regexp, normalize] of subjectMatchers) {
    const startsWithMatch = RegExp(`^${regexp.source}`).exec(value)
    if (startsWithMatch) return normalize(startsWithMatch)
  }
  for (const [regexp, normalize] of subjectMatchers) {
    const match = regexp.exec(value)
    if (match) return normalize(match)
  }
}
// END CUT AND PASTE OF APP CODE FROM /routes/circulars/circulars.lib.ts

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

export async function backfillEventIds() {
  const startTime = new Date()
  console.log('Starting EVENT ID backfill...', startTime)
  const writeLimit = 1000
  const dynamoTableName = '/RemixGcnProduction/tables/circulars'
  const TableName = await getTableNameFromSSM(dynamoTableName)
  const client = new DynamoDBClient({ region: 'us-east-1' })
  const pages = paginateScan({ client }, { TableName })
  let totalWriteCount = 0
  let limitHit = false

  for await (const page of pages) {
    if (limitHit) break
    const chunked = [...chunks(page.Items || [], 25)]

    for (const chunk of chunked) {
      if (limitHit) break
      let writes = []

      for (const record of chunk) {
        if (limitHit) break

        const circular = unmarshall(record)
        const parsedEventId = parseEventFromSubject(circular.subject)

        if (!circular.eventId && parsedEventId) {
          circular.eventId = parsedEventId
          writes.push(circular)
        }
      }

      if (writes.length + totalWriteCount > writeLimit) {
        const overage = writes.length + totalWriteCount - writeLimit
        const writesToLimitTo = writes.length - overage
        writes = writes.slice(0, writesToLimitTo)
        limitHit = true
      }

      if (writes.length > 0) {
        const command = new BatchWriteCommand({
          RequestItems: {
            [TableName]: writes.map((circ) => ({
              PutRequest: {
                Item: {
                  ...circ,
                },
              },
            })),
          },
        })

        await client.send(command)
        totalWriteCount = writes.length + totalWriteCount
      }
    }
  }
  const endTime = new Date()
  console.log('... End EVENT ID backfill... ', endTime)
  console.log('Total Event Ids Updated: ', totalWriteCount)
}

backfillEventIds()
