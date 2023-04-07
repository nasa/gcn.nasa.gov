/*!
 * Copyright © 2022 United States Government as represented by the Administrator
 * of the National Aeronautics and Space Administration. No copyright is claimed
 * in the United States under Title 17, U.S. Code. All Other Rights Reserved.
 *
 * SPDX-License-Identifier: NASA-1.3
 */
import { NavLink, Outlet } from '@remix-run/react'
import { SideNav } from '@trussworks/react-uswds'

export const handle = {
  breadcrumb: 'Documentation',
}

export default function () {
  return (
    <div className="grid-row grid-gap">
      <div className="desktop:grid-col-3">
        <SideNav
          items={[
            <NavLink key="." to="." end>
              About GCN
            </NavLink>,
            <NavLink key="client" to="client">
              Kafka Client Configuration
            </NavLink>,
            <>
              <NavLink key="circulars" to="circulars" end>
                Circulars
              </NavLink>
              <SideNav
                isSubnav={true}
                items={[
                  <NavLink key="subscribing" to="circulars/subscribing">
                    Subscribing
                  </NavLink>,
                  <NavLink key="submitting" to="circulars/submitting">
                    Submitting
                  </NavLink>,
                  <NavLink key="styleguide" to="circulars/styleguide">
                    Style Guide
                  </NavLink>,
                  <NavLink key="archive" to="circulars/archive">
                    Archive
                  </NavLink>,
                ]}
              />
            </>,
            <NavLink key="contribute" to="contribute">
              Contributing
            </NavLink>,
            <NavLink key="producers" to="producers">
              New Notice Producers
            </NavLink>,
            <NavLink key="roadmap" to="roadmap">
              Road Map
            </NavLink>,
            <NavLink key="faq" to="faq">
              Frequently Asked Questions
            </NavLink>,
          ]}
        />
      </div>
      <div className="desktop:grid-col-9">
        <Outlet />
      </div>
    </div>
  )
}
