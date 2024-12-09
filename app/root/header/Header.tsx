/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { Link, NavLink } from '@remix-run/react'
import {
  Menu,
  NavMenuButton,
  PrimaryNav,
  Title,
  Header as USWDSHeader,
} from '@trussworks/react-uswds'
import { useEffect, useState } from 'react'
import { useClickAnyWhere, useWindowSize } from 'usehooks-ts'

import { Meatball } from '~/components/meatball/Meatball'
import { useAdminStatus, useEmail, useUserIdp } from '~/root'

import styles from './header.module.css'

/**
 * A variation on the NavDropDownButton component from @trussworks/react-uswds
 * that acts as a simple hyperlink if JavaScript is disabled or if the page
 * has not yet been hydrated.
 *
 * Adapted from https://github.com/trussworks/react-uswds/blob/main/src/components/header/NavDropDownButton/NavDropDownButton.tsx.
 */
function NavDropDownButton({
  label,
  menuId,
  isOpen,
  onClick,
  isCurrent,
  className,
  ...props
}: {
  label: string
  menuId: string
  isOpen: boolean
  isCurrent?: boolean
} & Parameters<typeof NavLink>[0]) {
  return (
    <NavLink
      className={`usa-nav__link ${className}`}
      style={{ padding: 0 }}
      onClick={(e) => {
        onClick?.(e)
        // Always prevent default behavior because the button is supposed to
        // toggle visibility, not follow the link
        e.preventDefault()
        e.stopPropagation()
      }}
      {...props}
    >
      <button
        type="button"
        className="usa-accordion__button"
        data-testid="navDropDownButton"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <span>{label}</span>
      </button>
    </NavLink>
  )
}

export function Header() {
  const email = useEmail()
  const idp = useUserIdp()
  const [expanded, setExpanded] = useState(false)
  const [userMenuIsOpen, setUserMenuIsOpen] = useState(false)
  const isMobile = useWindowSize().width < 1024
  const userIsAdmin = useAdminStatus()

  function toggleMobileNav() {
    setExpanded((expanded) => !expanded)
  }

  function hideMobileNav() {
    setExpanded(false)
  }

  function hideUserMenu() {
    setUserMenuIsOpen(false)
  }

  // Hide the mobile nav if the screen is resized to a width larger than the
  // mobile size breakpoint.
  useEffect(() => {
    if (!isMobile) {
      hideMobileNav()
      hideUserMenu()
    }
  }, [isMobile])

  // Hide the user menu if the user clicks outside of it and we are not in
  // mobile mode.
  useClickAnyWhere(() => {
    if (userMenuIsOpen && !isMobile) hideUserMenu()
  })

  return (
    <>
      {expanded && (
        <div className="usa-overlay is-visible" onClick={hideMobileNav} />
      )}
      <USWDSHeader basic className={`usa-header--dark ${styles.header}`}>
        <div className="usa-nav-container">
          <div className="usa-navbar">
            <Title>
              <Link to="/">
                <Meatball className="width-auto" />
                <span>General Coordinates Network</span>
              </Link>
            </Title>
            <NavMenuButton onClick={toggleMobileNav} label="Menu" />
          </div>
          <PrimaryNav
            onClick={(e) => {
              // Hide the mobile nav if the user clicked on any child link
              // element, but not if the user clicked the nav itself.
              if (e.currentTarget !== e.target) hideMobileNav()
            }}
            mobileExpanded={expanded}
            items={[
              <NavLink className="usa-nav__link" to="/missions" key="/missions">
                Missions
              </NavLink>,
              <NavLink className="usa-nav__link" to="/notices" key="/notices">
                Notices
              </NavLink>,
              <NavLink
                className="usa-nav__link"
                to="/circulars"
                key="/circulars"
              >
                Circulars
              </NavLink>,
              <NavLink className="usa-nav__link" to="/docs" key="/docs">
                Documentation
              </NavLink>,
              email ? (
                <>
                  <NavDropDownButton
                    to="/user"
                    type="button"
                    key="user"
                    label={email}
                    isOpen={userMenuIsOpen}
                    onClick={() => {
                      setUserMenuIsOpen(!userMenuIsOpen)
                    }}
                    menuId="user"
                  />
                  <Menu
                    id="user"
                    isOpen={userMenuIsOpen}
                    items={[
                      <NavLink end key="user" to="/user">
                        Profile
                      </NavLink>,
                      userIsAdmin && (
                        <NavLink key="admin" to="/admin/kafka">
                          Admin
                        </NavLink>
                      ),
                      <NavLink key="endorsements" to="/user/endorsements">
                        Peer Endorsements
                      </NavLink>,
                      !idp && (
                        <NavLink key="password" to="/user/password">
                          Reset Password
                        </NavLink>
                      ),
                      <NavLink key="credentials" to="/user/credentials">
                        Client Credentials
                      </NavLink>,
                      <NavLink key="email" to="/user/email">
                        Email Notifications
                      </NavLink>,
                      <Link key="logout" to="/logout">
                        Sign Out
                      </Link>,
                    ]}
                  />
                </>
              ) : (
                <Link className="usa-nav__link" to="/login" key="/login">
                  Sign in / Sign up
                </Link>
              ),
            ]}
            onToggleMobileNav={toggleMobileNav}
          />
        </div>
      </USWDSHeader>
    </>
  )
}
