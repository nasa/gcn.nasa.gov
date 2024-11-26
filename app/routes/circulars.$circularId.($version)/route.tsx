/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { HeadersFunction, LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Link, useLoaderData, useRouteLoaderData } from '@remix-run/react'
import { Button, ButtonGroup, CardBody, Icon } from '@trussworks/react-uswds'
import { useRef, useState } from 'react'
import invariant from 'tiny-invariant'
import { useOnClickOutside } from 'usehooks-ts'

import type { loader as parentLoader } from '../circulars.$circularId/route'
import { get } from '../circulars/circulars.server'
import { MarkdownBody, PlainTextBody } from './Body'
import { FrontMatter } from './FrontMatter'
import DetailsDropdownButton from '~/components/DetailsDropdownButton'
import DetailsDropdownContent from '~/components/DetailsDropdownContent'
import { ToolbarButtonGroup } from '~/components/ToolbarButtonGroup'
import { origin } from '~/lib/env.server'
import { getCanonicalUrlHeaders, pickHeaders } from '~/lib/headers.server'
import { useSearchString } from '~/lib/utils'
import { useModStatus, useSubmitterStatus } from '~/root'
import type { BreadcrumbHandle } from '~/root/Title'

export const handle: BreadcrumbHandle<typeof loader> = {
  breadcrumb({ data }) {
    if (data) {
      const { subject, version } = data
      return `${version ? `v${version} - ` : ''} ${subject}`
    }
  },
}

export async function loader({
  params: { circularId, version },
}: LoaderFunctionArgs) {
  invariant(circularId)
  const result = await get(
    parseFloat(circularId),
    version ? parseFloat(version) : undefined
  )

  return json(result, {
    headers: {
      ...getCanonicalUrlHeaders(new URL(`/circulars/${circularId}`, origin)),
    },
  })
}

export function shouldRevalidate() {
  return true
}

export const headers: HeadersFunction = ({ loaderHeaders }) =>
  pickHeaders(loaderHeaders, ['Link'])

export default function () {
  const { circularId, body, bibcode, version, format, ...frontMatter } =
    useLoaderData<typeof loader>()
  const searchString = useSearchString()
  const Body = format === 'text/markdown' ? MarkdownBody : PlainTextBody

  const result = useRouteLoaderData<typeof parentLoader>(
    'routes/circulars.$circularId'
  )

  const latest = version && !result?.history.includes(version)
  const linkString = `/circulars/${circularId}${
    !latest && version ? `/${version}` : ''
  }`
  const previousCircularLinkString = `/circulars/${circularId - 1}${
    version ? `/${version}` : ''
  }`
  const nextCircularLinkString = `/circulars/${circularId + 1}${
    version ? `/${version}` : ''
  }`
  return (
    <>
      <ToolbarButtonGroup className="flex-wrap">
        <Link
          to={`/circulars${searchString}`}
          className="usa-button flex-align-stretch"
        >
          <div className="position-relative">
            <Icon.ArrowBack
              role="presentation"
              className="position-absolute top-0 left-0"
            />
          </div>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Back
        </Link>
        <ButtonGroup type="segmented">
          <Link
            to={`${linkString}.txt`}
            className="usa-button usa-button--outline"
            reloadDocument
          >
            Text
          </Link>
          <Link
            to={`${linkString}.json`}
            className="usa-button usa-button--outline"
            reloadDocument
          >
            JSON
          </Link>
          {bibcode ? (
            <Link
              to={`https://ui.adsabs.harvard.edu/abs/${bibcode}`}
              className="usa-button usa-button--outline"
              title="Retrieve bibliographic record from the SAO/NASA Astrophysics Data Service (ADS)."
            >
              Cite
            </Link>
          ) : (
            <Button
              type="button"
              disabled
              outline
              title="The ADS entry for this Circular is not yet available. ADS entries are updated every week on Monday at 08:00 UTC. Please check back later."
            >
              Cite
            </Button>
          )}
        </ButtonGroup>
        {useSubmitterStatus() && (
          <Link
            className="usa-button usa-button--outline"
            to={`/circulars/correction/${circularId}`}
          >
            Request Correction
          </Link>
        )}
        {result?.history && result.history.length > 0 && (
          <CircularsHistory circular={circularId} history={result?.history} />
        )}
        {useModStatus() && (
          <Link
            to={`/circulars/edit/${circularId}`}
            className="usa-button usa-button--outline"
          >
            Edit
          </Link>
        )}
      </ToolbarButtonGroup>
      <h1 className="margin-bottom-0">GCN Circular {circularId}</h1>
      <FrontMatter {...frontMatter} />
      <Body className="margin-y-2">{body}</Body>
      <ButtonGroup className="display-flex flex-justify-center">
        <Link to={`${previousCircularLinkString}`} className="usa-button">
          <div className="position-relative">
            <Icon.ArrowBack
              role="presentation"
              className="position-absolute top-0 left-0"
            />
          </div>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Previous Circular
        </Link>
        <Link to={`${nextCircularLinkString}`} className="usa-button">
          <div className="position-relative">
            <Icon.ArrowForward
              role="presentation"
              className="position-absolute top-0 left-0"
            />
          </div>
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Next Circular
        </Link>
      </ButtonGroup>
    </>
  )
}

function CircularsHistory({
  circular,
  history,
}: {
  circular: number
  history?: number[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [showContent, setShowContent] = useState(false)
  const searchString = useSearchString()
  useOnClickOutside(ref, () => {
    setShowContent(false)
  })
  return (
    <div ref={ref}>
      <DetailsDropdownButton
        outline
        onClick={() => {
          setShowContent((shown) => !shown)
        }}
      >
        Versions
      </DetailsDropdownButton>
      {showContent && (
        <DetailsDropdownContent>
          <CardBody>
            <Link
              onClick={() => setShowContent(!showContent)}
              to={`/circulars/${circular}`}
            >
              Latest
            </Link>
            {history &&
              history.map((version) => (
                <div key={version}>
                  <Link
                    onClick={() => setShowContent(!showContent)}
                    to={`/circulars/${circular}/${version}${searchString}`}
                  >
                    Version {version}
                  </Link>
                </div>
              ))}
          </CardBody>
        </DetailsDropdownContent>
      )}
    </div>
  )
}
