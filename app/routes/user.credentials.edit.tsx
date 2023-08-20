/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { DataFunctionArgs } from '@remix-run/node'

import {
  NewCredentialForm,
  handleCredentialActions,
  handleCredentialLoader,
} from '~/components/NewCredentialForm'

export const handle = { breadcrumb: 'New', getSitemapEntries: () => null }

export const loader = handleCredentialLoader

export async function action({ request }: DataFunctionArgs) {
  return handleCredentialActions(request, 'user')
}

export default function () {
  return (
    <>
      <h1>New Client Credentials</h1>
      <NewCredentialForm autoFocus />
    </>
  )
}
