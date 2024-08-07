/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 *
 *                                +-------------+
 *                                | TACH! TACH! |
 *                                +-------------+
 *                         \\    /
 *                 \\      (o>  /
 *                 (o>     //\
 *             ____(()_____V_/_____
 *                 ||      ||
 *                         ||
 *
 *
 */
import { cssBundleHref } from '@remix-run/css-bundle'
import type { LinksFunction, LoaderFunctionArgs } from '@remix-run/node'
import {
  Link,
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLocation,
  useNavigation,
  useRouteError,
  useRouteLoaderData,
} from '@remix-run/react'
import {
  ButtonGroup,
  FormGroup,
  GovBanner,
  GridContainer,
} from '@trussworks/react-uswds'
import type { ReactNode } from 'react'
import TopBarProgress from 'react-topbar-progress-indicator'
import { useSpinDelay } from 'spin-delay'
import invariant from 'tiny-invariant'

import { features, getEnvOrDieInProduction, origin } from './lib/env.server'
import { adminGroup } from './lib/kafka.server'
import { DevBanner } from './root/DevBanner'
import { Footer } from './root/Footer'
import NewsBanner from './root/NewsBanner'
import { type BreadcrumbHandle, Title } from './root/Title'
import { Header } from './root/header/Header'
import { getUser } from './routes/_auth/user.server'
import {
  moderatorGroup,
  submitterGroup,
} from './routes/circulars/circulars.server'

import highlightStyle from 'highlight.js/styles/github.css'
// FIXME: no top-level await, no import function
// const favicons = Object.fromEntries(
//   await Promise.all(
//     [16, 40, 57, 72, 114, 144, 192].map(async (size) => [
//       size,
//       await import(`~/theme/img/favicons/favicon-${size}.png`),
//     ])
//   )
// )
import favicon_16 from 'nasawds/src/img/favicons/favicon-16.png'
import favicon_40 from 'nasawds/src/img/favicons/favicon-40.png'
import favicon_57 from 'nasawds/src/img/favicons/favicon-57.png'
import favicon_72 from 'nasawds/src/img/favicons/favicon-72.png'
import favicon_114 from 'nasawds/src/img/favicons/favicon-114.png'
import favicon_144 from 'nasawds/src/img/favicons/favicon-144.png'
import favicon_192 from 'nasawds/src/img/favicons/favicon-192.png'
import themeStyle from '~/theme.css'

const favicons = {
  16: favicon_16,
  40: favicon_40,
  57: favicon_57,
  72: favicon_72,
  114: favicon_114,
  144: favicon_144,
  192: favicon_192,
}

TopBarProgress.config({
  barColors: {
    '0': '#e52207',
    '0.5': '#ffffff',
    '1.0': '#0050d8',
  },
})

export const handle: BreadcrumbHandle = {
  breadcrumb: 'GCN',
}

export const links: LinksFunction = () => [
  {
    rel: 'stylesheet',
    href: themeStyle,
  },
  ...(cssBundleHref ? [{ rel: 'stylesheet', href: cssBundleHref }] : []),
  ...Object.entries(favicons).map(([size, href]) => ({
    rel: 'icon',
    href,
    sizes: `${size}x${size}`,
  })),
]

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request)
  const email = user?.email
  const name = user?.name
  const idp = user?.idp
  const recaptchaSiteKey = getEnvOrDieInProduction('RECAPTCHA_SITE_KEY')
  const userIsMod = user?.groups.includes(moderatorGroup)
  const userIsVerifiedSubmitter = user?.groups.includes(submitterGroup)
  const userIsAdmin = user?.groups.includes(adminGroup)

  return {
    origin,
    email,
    name,
    features,
    recaptchaSiteKey,
    idp,
    userIsMod,
    userIsVerifiedSubmitter,
    userIsAdmin,
  }
}

/** Don't reevaluate this route's loader due to client-side navigations. */
export function shouldRevalidate() {
  return false
}

function useLoaderDataRoot() {
  const result = useRouteLoaderData<typeof loader>('root')
  invariant(result)
  return result
}

export function useUserIdp() {
  const { idp } = useLoaderDataRoot()
  return idp
}

export function useEmail() {
  const { email } = useLoaderDataRoot()
  return email
}

export function useName() {
  const { name } = useLoaderDataRoot()
  return name
}

export function useModStatus() {
  const { userIsMod } = useLoaderDataRoot()
  return userIsMod
}

export function useSubmitterStatus() {
  const { userIsVerifiedSubmitter } = useLoaderDataRoot()
  return userIsVerifiedSubmitter
}

export function useAdminStatus() {
  const { userIsAdmin } = useLoaderDataRoot()
  return userIsAdmin
}

export function useRecaptchaSiteKey() {
  const { recaptchaSiteKey } = useLoaderDataRoot()
  return recaptchaSiteKey
}

/**
 * Return true if the given feature flag is enabled.
 *
 * This is a React hook version of {@link feature}.
 *
 * Feature flags are configured by the environment variable GCN_FEATURES, which
 * is a comma-separated list of enabled features.
 */
export function useFeature(feature: string) {
  const featureUppercase = feature.toUpperCase()
  return useLoaderDataRoot().features.includes(featureUppercase)
}

export function WithFeature({
  children,
  ...features
}: {
  children: ReactNode
} & Record<string, boolean>) {
  return <>{useFeature(Object.keys(features)[0]) && children}</>
}

export function useUrl() {
  const { origin } = useLoaderDataRoot()
  const { pathname, search, hash } = useLocation()
  const url = new URL(origin)
  url.pathname = pathname
  url.search = search
  url.hash = hash
  return url.toString()
}

export function useOrigin() {
  return useLoaderDataRoot().origin
}

export function useHostname() {
  return new URL(useLoaderDataRoot().origin).hostname
}

export function useDomain() {
  const hostname = useHostname()

  if (hostname === 'gcn.nasa.gov') {
    return null
  } else if (hostname === 'dev.gcn.nasa.gov') {
    return 'dev.gcn.nasa.gov'
  } else {
    return 'test.gcn.nasa.gov'
  }
}

function Progress() {
  const { state } = useNavigation()
  const showProgress = useSpinDelay(state !== 'idle')
  return <>{showProgress && <TopBarProgress />}</>
}

export function Layout({ children }: { children?: ReactNode }) {
  const noIndex = useHostname() !== 'gcn.nasa.gov'

  return (
    <html lang="en-US">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {noIndex && <meta name="robots" content="noindex" />}
        <Meta />
        <Links />
        <Title />
      </head>
      <body>
        <a className="usa-skipnav" href="#main-content">
          Skip to main content
        </a>
        <Progress />
        <GovBanner />
        <DevBanner />
        <Header />
        <NewsBanner>
          Announcing GCN Classic Migration Survey, End of Legacy Circulars
          Email. See{' '}
          <Link
            className="usa-link"
            to="/news#-gcn-classic-migration-survey-and-legacy-circular-submission-email-retirement"
          >
            news and announcements
          </Link>
        </NewsBanner>
        <main id="main-content">{children}</main>
        <Footer />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
        {/* Deferred stylesheets (non render blocking) */}
        <link rel="stylesheet" href={highlightStyle} />
      </body>
    </html>
  )
}

function ErrorUnexpected({ children }: { children?: ReactNode }) {
  return (
    <GridContainer className="usa-section">
      <h1>Unexpected error {children}</h1>
      <p className="usa-intro">An unexpected error occurred.</p>
      <FormGroup>
        <ButtonGroup>
          <Link to="/" className="usa-button">
            Go home
          </Link>
        </ButtonGroup>
      </FormGroup>
    </GridContainer>
  )
}

function ErrorUnauthorized() {
  const url = useUrl()
  return (
    <GridContainer className="usa-section">
      <h1>Unauthorized</h1>
      <p className="usa-intro">
        We're sorry, you must log in to access the page you're looking for.
      </p>
      <p className="usa-paragraph">Log in to access that page, or go home.</p>
      <FormGroup>
        <ButtonGroup>
          <Link
            to={`/login?redirect=${encodeURIComponent(url)}`}
            className="usa-button"
          >
            Log in and take me there
          </Link>
          <Link to="/" className="usa-button usa-button--outline">
            Go home
          </Link>
        </ButtonGroup>
      </FormGroup>
    </GridContainer>
  )
}

function ErrorNotFound() {
  return (
    <GridContainer className="usa-section">
      <h1>Page not found</h1>
      <p className="usa-intro">
        We're sorry, we can't find the page you're looking for. It might have
        been removed, changed its name, or is otherwise unavailable.
      </p>
      <p className="usa-paragraph">
        Visit our homepage for helpful tools and resources, or contact us and
        we'll point you in the right direction.
      </p>
      <FormGroup>
        <ButtonGroup>
          <Link to="/" className="usa-button">
            Visit homepage
          </Link>
          <Link to="/contact" className="usa-button usa-button--outline">
            Contact us
          </Link>
        </ButtonGroup>
      </FormGroup>
    </GridContainer>
  )
}

export function ErrorBoundary() {
  const error = useRouteError()
  if (isRouteErrorResponse(error)) {
    switch (error.status) {
      case 403:
        return <ErrorUnauthorized />
      case 404:
        return <ErrorNotFound />
      default:
        return <ErrorUnexpected>HTTP {error.status}</ErrorUnexpected>
    }
  } else {
    console.error(error)
    return <ErrorUnexpected />
  }
}

export default function () {
  return <Outlet />
}
