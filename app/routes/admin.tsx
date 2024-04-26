/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import type { LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, Outlet } from '@remix-run/react'
import { GridContainer, SideNav } from '@trussworks/react-uswds'

import { getUser } from './_auth/user.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request)
  if (!user?.groups.includes('gcn.nasa.gov/gcn-admin'))
    throw new Response(null, { status: 403 })
  return null
}

export default function () {
  return (
    <GridContainer className="usa-section">
      <div className="grid-row grid-gap">
        <div className="desktop:grid-col-3">
          <SideNav
            items={[
              <NavLink key="users" to="users" end>
                Users
              </NavLink>,
            ]}
          />
        </div>
        <div className="desktop:grid-col-9">
          <Outlet />
        </div>
      </div>
    </GridContainer>
  )
}
