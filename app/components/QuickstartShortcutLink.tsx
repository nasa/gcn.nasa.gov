import { Link } from '@remix-run/react'

import {
  JsonNoticeTypes,
  NoticeTypes,
} from './NoticeTypeCheckboxes/NoticeTypeCheckboxes'
import { WithCredentials } from '~/root'

export default function QuickstartShortcutLink({
  alertKey,
  format,
  otherAlerts,
}: {
  alertKey: string
  format: 'json' | 'text'
  otherAlerts?: string[] // Alerts specifically under the 'Other' tab, since they can't be generically selected as all
}) {
  const selectedAlerts =
    alertKey == 'Other'
      ? otherAlerts?.map((alert) => `&alerts=${alert}`).join('')
      : (format == 'text' ? NoticeTypes[alertKey] : JsonNoticeTypes[alertKey])
          ?.map((alert) => `&alerts=${alert}`)
          .join('')

  return (
    <Link
      to={`/quickstart/alerts?clientId=${WithCredentials()}&format=${format}${selectedAlerts}`}
    >
      Kafka Stream
    </Link>
  )
}
