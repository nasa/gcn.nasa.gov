/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { useFetcher, useLoaderData } from '@remix-run/react'
import type { ModalRef } from '@trussworks/react-uswds'
import {
  Button,
  Grid,
  Icon,
  Label,
  Modal,
  ModalFooter,
  ModalHeading,
  ModalToggleButton,
  TextInput,
} from '@trussworks/react-uswds'
import { groupBy, sortBy } from 'lodash'
import { useEffect, useRef, useState } from 'react'

import { getUser } from './_auth/user.server'
import HeadingWithAddButton from '~/components/HeadingWithAddButton'
import SegmentedCards from '~/components/SegmentedCards'
import Spinner from '~/components/Spinner'
import TimeAgo from '~/components/TimeAgo'
import type { KafkaACL, UserClientType } from '~/lib/kafka.server'
import {
  adminGroup,
  createKafkaACL,
  deleteKafkaACL,
  getKafkaACLsFromDynamoDB,
  getLastSyncDate,
  updateBrokersFromDb,
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
    return null
  }

  if (intent === 'migrateFromDB') {
    await updateBrokersFromDb(user)
    return null
  }

  const promises = []

  switch (intent) {
    case 'delete':
      const aclId = getFormDataString(data, 'aclId')
      if (!aclId) throw new Response(null, { status: 400 })
      promises.push(deleteKafkaACL(user, [aclId]))
      break
    case 'create':
      const resourceName = getFormDataString(data, 'resourceName')
      const userClientType = getFormDataString(
        data,
        'userClientType'
      ) as UserClientType
      const group = getFormDataString(data, 'group')
      const permissionTypeString = getFormDataString(data, 'permissionType')
      const includePrefixed = getFormDataString(data, 'includePrefixed')
      const resourceTypeString = getFormDataString(data, 'resourceType')

      if (
        !resourceName ||
        !userClientType ||
        !group ||
        !permissionTypeString ||
        !resourceTypeString
      )
        throw new Response(null, { status: 400 })

      const permissionType = parseInt(permissionTypeString) // Allow, deny
      const resourceType = parseInt(resourceTypeString)

      promises.push(
        createKafkaACL(
          user,
          userClientType,
          resourceName,
          group,
          permissionType,
          resourceType,
          Boolean(includePrefixed)
        )
      )

      break
    default:
      break
  }
  await Promise.all(promises)

  return null
}

export default function Index() {
  const { dynamoDbAclData, latestSync } = useLoaderData<typeof loader>()
  const [aclData, setAclData] = useState(dynamoDbAclData)
  const updateFetcher = useFetcher<typeof action>()
  const aclFetcher = useFetcher<typeof loader>()
  const brokerFromDbFetcher = useFetcher()
  const ref = useRef<ModalRef>(null)

  useEffect(() => {
    setAclData(aclFetcher.data?.dynamoDbAclData ?? aclData)
  }, [aclFetcher.data, aclData])

  return (
    <>
      <HeadingWithAddButton headingLevel={1}>Kafka</HeadingWithAddButton>
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
      <ModalToggleButton
        opener
        disabled={
          updateFetcher.state !== 'idle' || brokerFromDbFetcher.state !== 'idle'
        }
        modalRef={ref}
        type="button"
      >
        Update Broker from DB
      </ModalToggleButton>
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
                  <h3>Resource: {key}</h3>
                  {aclData[key].map((acl, index) => (
                    <KafkaAclCard key={`${key}-${index}`} acl={acl} />
                  ))}
                </span>
              ))}
          </SegmentedCards>
        </>
      )}
      <Modal
        id="modal-update"
        ref={ref}
        aria-labelledby="modal-update-heading"
        aria-describedby="modal-update-description"
        renderToPortal={false} // FIXME: https://github.com/trussworks/react-uswds/pull/1890#issuecomment-1023730448
      >
        <brokerFromDbFetcher.Form method="POST" action="/admin/kafka">
          <ModalHeading id="modal-update-heading">Confirm Update</ModalHeading>
          <p id="modal-update-description">
            This will affect some_number of ACLs currently defined on the
            broker. If you want to maintain the ACLs defined on the brokers,
            click cancel to close this window then click the Pull ACLs from
            Broker button.
          </p>
          <p>This action cannot be undone.</p>
          <ModalFooter>
            <ModalToggleButton modalRef={ref} closer outline>
              Cancel
            </ModalToggleButton>
            <Button
              data-close-modal
              type="submit"
              name="intent"
              value="migrateFromDB"
            >
              Confirm
            </Button>
          </ModalFooter>
        </brokerFromDbFetcher.Form>
      </Modal>
    </>
  )
}

function KafkaAclCard({ acl }: { acl: KafkaACL }) {
  const ref = useRef<ModalRef>(null)
  const fetcher = useFetcher()
  const disabled = fetcher.state !== 'idle'

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
    <>
      <Grid row style={disabled ? { opacity: '50%' } : undefined}>
        <div className="tablet:grid-col flex-fill margin-y-1">
          <div>
            <strong>Type:</strong> {resourceTypeMap[acl.resourceType]}
          </div>
          <div>
            <strong>Group:</strong> {acl.principal}
          </div>
          <div>
            <strong>Permission:</strong> {permissionMap[acl.permissionType]}
          </div>
          <div>
            <strong>Operation:</strong> {operationMap[acl.operation]}
          </div>
        </div>
        <div className="tablet:grid-col flex-auto margin-y-auto">
          <ModalToggleButton
            opener
            disabled={disabled}
            modalRef={ref}
            type="button"
            className="usa-button--secondary"
          >
            <Icon.Delete
              role="presentation"
              className="bottom-aligned margin-right-05"
            />
            Delete
          </ModalToggleButton>
        </div>
      </Grid>
      <Modal
        id="modal-delete"
        ref={ref}
        aria-labelledby="modal-delete-heading"
        aria-describedby="modal-delete-description"
        renderToPortal={false}
      >
        <fetcher.Form method="POST" action="/admin/kafka">
          <input type="hidden" name="aclId" value={acl.aclId} />
          <ModalHeading id="modal-delete-heading">
            Delete Kafka ACL
          </ModalHeading>
          <p id="modal-delete-description">
            This will delete the DynamoDB entry and remove the ACL from the
            broker. Do you wish to continue?
          </p>
          <ModalFooter>
            <ModalToggleButton modalRef={ref} closer outline>
              Cancel
            </ModalToggleButton>
            <Button data-close-modal type="submit" name="intent" value="delete">
              Delete
            </Button>
          </ModalFooter>
        </fetcher.Form>
      </Modal>
    </>
  )
}
