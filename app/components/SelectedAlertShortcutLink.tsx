import { Link } from '@remix-run/react'

import {
  JsonNoticeTypes,
  NoticeTypes,
} from './NoticeTypeCheckboxes/NoticeTypeCheckboxes'
import { WithCredentials } from '~/root'

export default function SelectedAlertShortcutLink({
  alertKey,
  format,
  otherAlerts,
  destination,
}: {
  alertKey: string
  format: 'json' | 'text'
  destination: 'quickstart' | 'email'
  otherAlerts?: string[] // Alerts specifically under the 'Other' tab, since they can't be generically selected as all
}) {
  const selectedAlerts =
    alertKey == 'Other'
      ? otherAlerts?.map((alert) => `&alerts=${alert}`).join('')
      : (format == 'text' ? NoticeTypes[alertKey] : JsonNoticeTypes[alertKey])
          ?.map((alert) => `&alerts=${alert}`)
          .join('')

  const baseUrl =
    destination == 'quickstart'
      ? `/quickstart/alerts?clientId=${WithCredentials()}&format=${format}${selectedAlerts}`
      : `/user/email/edit?format=${format}${selectedAlerts}`

  return (
    <Link to={`${baseUrl}&format=${format}${selectedAlerts}`}>
      {destination === 'quickstart' ? 'Kafka Stream' : 'Email'}
    </Link>
  )
}
