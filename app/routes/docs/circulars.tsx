/*!
 * Copyright © 2022 United States Government as represented by the Administrator
 * of the National Aeronautics and Space Administration. No copyright is claimed
 * in the United States under Title 17, U.S. Code. All Other Rights Reserved.
 *
 * SPDX-License-Identifier: NASA-1.3
 */
import { Outlet } from '@remix-run/react'

export const handle = {
  breadcrumb: 'Circulars',
}

export default function () {
  return (
    <div className="desktop:grid-col-9">
      <Outlet />
    </div>
  )
}
