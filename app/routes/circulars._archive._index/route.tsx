/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams,
  useSubmit,
} from '@remix-run/react'
import { Alert, Button, Icon, Label, TextInput } from '@trussworks/react-uswds'
import clamp from 'lodash/clamp'
import { useId, useState } from 'react'

import {
  circularRedirect,
  createChangeRequest,
  get,
  getChangeRequest,
  getChangeRequests,
  moderatorGroup,
  put,
  putVersion,
  search,
} from '../circulars/circulars.server'
import CircularsHeader from './CircularsHeader'
import CircularsIndex from './CircularsIndex'
import { DateSelector } from './DateSelectorMenu'
import { LuceneAccordion } from './LuceneMenu'
import { SortSelector } from './SortSelectorButton'
import SynonymGroupIndex from './SynonymGroupIndex'
import Hint from '~/components/Hint'
import { ToolbarButtonGroup } from '~/components/ToolbarButtonGroup'
import PaginationSelectionFooter from '~/components/pagination/PaginationSelectionFooter'
import { feature, origin } from '~/lib/env.server'
import { getFormDataString } from '~/lib/utils'
import { postZendeskRequest } from '~/lib/zendesk.server'
import { useFeature, useModStatus } from '~/root'
import { getUser } from '~/routes/_auth/user.server'
import {
  type CircularFormat,
  type CircularMetadata,
  circularFormats,
} from '~/routes/circulars/circulars.lib'
import type { SynonymGroupWithMembers } from '~/routes/synonyms/synonyms.lib'
import { groupMembersByEventId } from '~/routes/synonyms/synonyms.server'

import searchImg from 'nasawds/src/img/usa-icons-bg/search--white.svg'

export async function loader({ request: { url } }: LoaderFunctionArgs) {
  const synonymFlagIsOn = feature('SYNONYMS')
  const { searchParams } = new URL(url)
  const query = searchParams.get('query') || undefined
  const view = synonymFlagIsOn ? searchParams.get('view') || 'index' : 'index'
  const isGroupView = view === 'group'

  if (query && view === 'index') {
    await circularRedirect(query)
  }

  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = clamp(parseInt(searchParams.get('limit') || '100'), 1, 100)
  const sort = searchParams.get('sort') || 'circularId'
  const searchFunction = view != 'group' ? search : groupMembersByEventId
  const results = await searchFunction({
    query,
    page: page - 1,
    limit,
    startDate,
    endDate,
    sort,
  })
  const requestedChangeCount = (await getChangeRequests()).length

  return {
    page,
    ...results,
    requestedChangeCount,
    limit,
    isGroupView,
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.formData()
  const body = getFormDataString(data, 'body')
  const subject = getFormDataString(data, 'subject')
  const intent = getFormDataString(data, 'intent')
  const format = getFormDataString(data, 'format') as CircularFormat | undefined
  if (format && !circularFormats.includes(format)) {
    throw new Response('Invalid format', { status: 400 })
  }
  if (!body || !subject)
    throw new Response('Body and subject are required', { status: 400 })
  const user = await getUser(request)
  const circularId = getFormDataString(data, 'circularId')
  const createdOnDate =
    getFormDataString(data, 'createdOn') || Date.now().toString()
  const createdOn = Date.parse(createdOnDate)
  let newCircular
  const props = { body, subject, ...(format ? { format } : {}) }
  switch (intent) {
    case 'correction':
      if (circularId === undefined)
        throw new Response('circularId is required', { status: 400 })

      if (!user?.name || !user.email) throw new Response(null, { status: 403 })
      let submitter
      if (user.groups.includes(moderatorGroup)) {
        submitter = getFormDataString(data, 'submitter')
        if (!submitter) throw new Response(null, { status: 400 })
      }
      const eventId = getFormDataString(data, 'eventId')

      if (!createdOnDate || !createdOn)
        throw new Response(null, { status: 400 })

      let zendeskTicketId: number | undefined

      try {
        zendeskTicketId = (
          await getChangeRequest(parseFloat(circularId), user.sub)
        ).zendeskTicketId
      } catch (err) {
        if (!(err instanceof Response && err.status === 404)) throw err
      }

      if (!zendeskTicketId) {
        zendeskTicketId = await postZendeskRequest({
          requester: { name: user.name, email: user.email },
          subject: `Change Request for Circular ${circularId}`,
          comment: {
            body: `${user.name} has requested an edit. Review at ${origin}/circulars`,
          },
        })
      }

      if (!zendeskTicketId) throw new Response(null, { status: 500 })

      await createChangeRequest(
        {
          circularId: parseFloat(circularId),
          ...props,
          submitter,
          createdOn,
          zendeskTicketId,
          eventId,
        },
        user
      )
      newCircular = null
      break
    case 'edit':
      if (circularId === undefined)
        throw new Response('circularId is required', { status: 400 })
      if (!createdOnDate || !createdOn)
        throw new Response(null, { status: 400 })
      await putVersion(
        {
          circularId: parseFloat(circularId),
          ...props,
          createdOn,
        },
        user
      )
      newCircular = await get(parseFloat(circularId))
      break
    case 'new':
      newCircular = await put({ ...props, submittedHow: 'web' }, user)
      break
    default:
      break
  }
  return { newCircular, intent }
}

export default function () {
  const result = useActionData<typeof action>()
  const {
    items,
    page,
    totalPages,
    totalItems,
    requestedChangeCount,
    limit,
    isGroupView,
  } = useLoaderData<typeof loader>()

  // Concatenate items from the action and loader functions
  const allItems = [
    ...(result?.newCircular ? [result.newCircular] : []),
    ...(items || []),
  ]

  const formId = useId()
  const submit = useSubmit()
  const [searchParams] = useSearchParams()
  const userIsModerator = useModStatus()
  const synonymFlagIsOn = useFeature('SYNONYMS')

  // Strip off the ?index param if we navigated here from a form.
  // See https://remix.run/docs/en/main/guides/index-query-param.
  searchParams.delete('index')

  const query = searchParams.get('query') || ''
  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined
  const sort = searchParams.get('sort') || 'circularID'
  const view = synonymFlagIsOn ? searchParams.get('view') || 'index' : 'index'

  let searchString = searchParams.toString()
  if (searchString) searchString = `?${searchString}`

  const [inputQuery, setInputQuery] = useState(query)
  const viewState = isGroupView ? 'Index' : 'Group'
  const clean = inputQuery === query
  const searchText = isGroupView ? 'Event Name' : 'Search'

  return (
    <>
      {result?.intent === 'correction' && (
        <Alert
          type="success"
          headingLevel="h1"
          slim
          heading="Request Submitted"
        >
          Thank you for your correction. A GCN Circulars moderator will review
          it shortly.
        </Alert>
      )}

      <CircularsHeader />

      {userIsModerator && requestedChangeCount > 0 && (
        <Link to="moderation" className="usa-button usa-button--outline">
          Review {requestedChangeCount} Requested Change
          {requestedChangeCount > 1 ? 's' : ''}
        </Link>
      )}
      {userIsModerator && (
        <Link to="/synonyms" className="usa-button usa-button--outline">
          Synonym Moderation
        </Link>
      )}
      <ToolbarButtonGroup className="position-sticky top-0 bg-white margin-bottom-1 padding-top-1 z-300">
        <Form
          preventScrollReset
          className="display-inline-block usa-search usa-search--small"
          role="search"
          id={formId}
        >
          <Label srOnly htmlFor="query">
            Search
          </Label>
          <input type="hidden" name="view" value={view} />
          <TextInput
            autoFocus
            className="minw-15"
            id="query"
            name="query"
            type="search"
            placeholder={searchText}
            defaultValue={inputQuery}
            aria-describedby="searchHint"
            onChange={({ target: { form, value } }) => {
              setInputQuery(value)
              if (!value) submit(form, { preventScrollReset: true })
            }}
          />
          <Button type="submit">
            <img
              src={searchImg}
              className="usa-search__submit-icon"
              alt="Search"
            />
          </Button>
        </Form>

        {query && !isGroupView && (
          <SortSelector form={formId} defaultValue={sort} />
        )}

        {synonymFlagIsOn && (
          <Link
            to={`/circulars?view=${viewState.toLowerCase()}&limit=${limit}`}
            preventScrollReset
          >
            <Button
              type="button"
              className="padding-y-1"
            >{`${viewState} View`}</Button>
          </Link>
        )}

        <Link to={`/circulars/new${searchString}`}>
          <Button type="button" className="padding-y-1">
            <Icon.Edit role="presentation" /> New
          </Button>
        </Link>

        {!isGroupView && (
          <DateSelector
            form={formId}
            defaultStartDate={startDate}
            defaultEndDate={endDate}
          />
        )}
      </ToolbarButtonGroup>
      {!isGroupView && (
        <Hint id="searchHint">
          Search for Circulars by submitter, subject, or body text (e.g. 'Fermi
          GRB'). <br />
          To navigate to a specific circular, enter the associated Circular ID
          (e.g. 'gcn123', 'Circular 123', or '123').
        </Hint>
      )}
      {isGroupView && (
        <Hint id="searchHint">
          Search for Event Groups by eventID (e.g. 'GRB 123456A', 'GRB123456A',
          '123456A'). <br />
        </Hint>
      )}
      {useFeature('CIRCULARS_LUCENE') && <LuceneAccordion />}
      {clean && (
        <>
          {isGroupView ? (
            <SynonymGroupIndex
              allItems={items as SynonymGroupWithMembers[]}
              searchString={searchString}
              totalItems={totalItems}
              query={query}
            />
          ) : (
            <CircularsIndex
              allItems={allItems as CircularMetadata[]}
              searchString={searchString}
              totalItems={totalItems}
              query={query}
            />
          )}

          <PaginationSelectionFooter
            query={query}
            page={page}
            limit={limit}
            totalPages={totalPages}
            form={formId}
            view={view}
          />
        </>
      )}
    </>
  )
}
