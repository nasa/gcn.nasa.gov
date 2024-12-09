/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import { Button, Label, Table, TextInput } from '@trussworks/react-uswds'
import { groupBy, sortBy } from 'lodash'
import { useEffect, useState } from 'react'

import { getUser } from './_auth/user.server'
import SegmentedCards from '~/components/SegmentedCards'
import Spinner from '~/components/Spinner'
import TimeAgo from '~/components/TimeAgo'
import type { KafkaACL } from '~/lib/kafka.server'
import {
  adminGroup,
  getKafkaACLsFromDynamoDB,
  getLastSyncDate,
  updateDbFromBrokers,
} from '~/lib/kafka.server'
import { getFormDataString } from '~/lib/utils'

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request)
  if (!user || !user.groups.includes(adminGroup))
    throw new Response(null, { status: 403 })
  const { aclFilter } = Object.fromEntries(new URL(request.url).searchParams)
  const dynamoDbAclData = groupBy(
    sortBy(await getKafkaACLsFromDynamoDB(user, aclFilter), [
      'resourceName',
      'principal',
    ]),
    'resourceName'
  )
  const latestSync = await getLastSyncDate()
  return { dynamoDbAclData, latestSync }
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await getUser(request)
  if (!user?.groups.includes(adminGroup))
    throw new Response(null, { status: 403 })
  const data = await request.formData()
  const intent = getFormDataString(data, 'intent')

  if (intent === 'migrateFromBroker') {
    await updateDbFromBrokers(user)
  }
  return null
}

export default function Index() {
  const { dynamoDbAclData, latestSync } = useLoaderData<typeof loader>()
  const [aclData, setAclData] = useState(dynamoDbAclData)
  const updateFetcher = useFetcher<typeof action>()
  const aclFetcher = useFetcher<typeof loader>()
  const brokerFromDbFetcher = useFetcher()

  useEffect(() => {
    setAclData(aclFetcher.data?.dynamoDbAclData ?? aclData)
  }, [aclFetcher.data, aclData])

  return (
    <>
      <h1>Kafka</h1>
      <h2>Kafka ACLs</h2>
      <p className="usa-paragraph">
        Kafka Access Control Lists (ACLs) are a security mechanism used to
        control access to resources within a Kafka cluster. They define which
        users or client applications have permissions to perform specific
        operations on Kafka resources, such as topics, consumer groups, and
        broker resources. ACLs specify who can produce (write) or consume (read)
        data from topics, create or delete topics, manage consumer groups, and
        perform administrative tasks.
      </p>
      <updateFetcher.Form method="POST" action="/admin/kafka">
        <Button
          type="submit"
          name="intent"
          value="migrateFromBroker"
          disabled={
            updateFetcher.state !== 'idle' ||
            brokerFromDbFetcher.state !== 'idle'
          }
        >
          Pull ACLs from Broker
        </Button>
        {updateFetcher.state !== 'idle' && (
          <span className="text-middle">
            <Spinner /> Updating...
          </span>
        )}
      </updateFetcher.Form>
      {latestSync ? (
        <p>
          Last synced by {latestSync.syncedBy}{' '}
          <TimeAgo time={latestSync.syncedOn} />
        </p>
      ) : (
        <br />
      )}
      {brokerFromDbFetcher.state !== 'idle' && (
        <span className="text-middle">
          <Spinner /> Updating...
        </span>
      )}
      {aclData && (
        <>
          <aclFetcher.Form method="GET">
            <Label htmlFor="aclFilter">
              Filter ({Object.keys(aclData).length} results)
            </Label>
            <TextInput id="aclFilter" name="aclFilter" type="text" />
            <Button
              type="submit"
              className="margin-y-1"
              disabled={aclFetcher.state !== 'idle'}
            >
              Search
            </Button>
            {aclFetcher.state !== 'idle' && (
              <span className="text-middle">
                <Spinner /> Loading...
              </span>
            )}
          </aclFetcher.Form>
          <SegmentedCards>
            {Object.keys(aclData)
              .sort((a, b) => a.localeCompare(b))
              .flatMap((key) => (
                <span key={key}>
                  <div className="position-sticky top-0 bg-white z-100 padding-y-2">
                    <h3 className="margin-y-0">Resource: {key}</h3>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Group</th>
                        <th>Permission</th>
                        <th>Operation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aclData[key].map((acl, index) => (
                        <KafkaAclCard key={`${key}-${index}`} acl={acl} />
                      ))}
                    </tbody>
                  </Table>
                </span>
              ))}
          </SegmentedCards>
        </>
      )}
    </>
  )
}

function KafkaAclCard({ acl }: { acl: KafkaACL }) {
  // TODO: These maps can probably be refactored, since they are
  // just inverting the enum from kafka, but importing them
  // directly here causes some errors. Same for mapping them to
  // dropdowns
  const permissionMap: { [key: number]: string } = {
    2: 'Deny',
    3: 'Allow',
  }

  const operationMap: { [key: number]: string } = {
    0: 'Unknown',
    1: 'Any',
    2: 'All',
    3: 'Read',
    4: 'Write',
    5: 'Create',
    6: 'Delete',
    7: 'Alter',
    8: 'Describe',
    9: 'Cluster Action',
    10: 'Describe Configs',
    11: 'Alter Configs',
    12: 'Idempotent Write',
  }

  const resourceTypeMap: { [key: number]: string } = {
    0: 'Unknown',
    1: 'Any',
    2: 'Topic',
    3: 'Group',
    4: 'Cluster',
    5: 'Transactional Id',
    6: 'Delegation Token',
  }

  return (
    <tr className="tablet:grid-col flex-fill margin-y-1">
      <td>{resourceTypeMap[acl.resourceType]}</td>
      <td>{acl.principal}</td>
      <td>{permissionMap[acl.permissionType]}</td>
      <td>{operationMap[acl.operation]}</td>
    </tr>
  )
}
