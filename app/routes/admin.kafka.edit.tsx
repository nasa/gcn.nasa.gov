/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoaderFunctionArgs } from '@remix-run/node'
import { Form, useLoaderData } from '@remix-run/react'
import {
  Button,
  Checkbox,
  Label,
  Select,
  TextInput,
} from '@trussworks/react-uswds'

import { getUser } from './_auth/user.server'
import { getGroups } from '~/lib/cognito.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request)
  if (!user) throw new Response(null, { status: 403 })
  const userGroups = (await getGroups())
    .filter((group) => group.GroupName?.startsWith('gcn.nasa.gov/'))
    .map((group) => group.GroupName)

  return { userGroups }
}

export default function Kafka() {
  const { userGroups } = useLoaderData<typeof loader>()
  return <KafkaAclForm groups={userGroups} />
}

function KafkaAclForm({ groups }: { groups: string[] }) {
  return (
    <>
      <h1>Create Kafka ACLs</h1>
      <Form method="POST" action="/admin/kafka">
        <Label htmlFor="name">
          Resource Name
          <span title="required" className="usa-label--required">
            *
          </span>
        </Label>
        <TextInput
          autoFocus
          id="resourceName"
          name="resourceName"
          type="text"
          autoCapitalize="off"
          autoCorrect="off"
          required
        />
        <Label htmlFor="resourceType">Resource Type</Label>
        <Select id="resourceType" name="resourceType">
          <option value="2">Topic</option>
          <option value="3">Group</option>
        </Select>
        <Label htmlFor="userClientType">Client Type</Label>
        <Select id="userClientType" name="userClientType">
          <option value="producer">Producer</option>
          <option value="consumer">Consumer</option>
        </Select>
        <small>
          Producer will generate ACLs for the Create, Write, and Describe
          operations. Consumer will generate ACLs for the Read and Describe
          operations
        </small>
        <Label htmlFor="group">Group</Label>
        <Select id="group" name="group">
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </Select>
        <Label htmlFor="permissionType">Permission</Label>
        <Select id="permissionType" name="permissionType">
          <option value="3">Allow</option>
          <option value="2">Deny</option>
        </Select>
        <Checkbox
          id="includePrefixed"
          name="includePrefixed"
          label="Generate both Prefixed and Literal Topics?"
        />
        <div className="margin-bottom-1">
          <small>
            If yes, submission will also trigger th generation of ACLs for the
            provided topic name as a PREFIXED topic with a period included at
            the end. For example, if checked, a topic of `gcn.notices.icecube`
            will result in ACLs for both `gcn.notices.icecube` (literal) and
            `gcn.notices.icecube.` (prefixed).
          </small>
        </div>
        <Button type="submit" name="intent" value="create">
          Submit
        </Button>
      </Form>
    </>
  )
}
