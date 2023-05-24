/*!
 * Copyright © 2022 United States Government as represented by the Administrator
 * of the National Aeronautics and Space Administration. No copyright is claimed
 * in the United States under Title 17, U.S. Code. All Other Rights Reserved.
 *
 * SPDX-License-Identifier: NASA-1.3
 */
import { Button, ButtonGroup } from '@trussworks/react-uswds'
import { useState } from 'react'
import { useLocation } from 'react-router'

export type NoticeFormat = 'text' | 'voevent' | 'binary' | 'json'

export function NoticeFormatInput({
  name,
  value,
  onChange,
}: {
  name: string
  value?: NoticeFormat
  onChange?: (arg: NoticeFormat) => void
}) {
  const [currentValue, setCurrentValue] = useState<NoticeFormat | undefined>(
    value
  )
  const [hover, setHover] = useState<NoticeFormat | undefined>(undefined)

  function clearHover() {
    setHover(undefined)
  }
  const location = useLocation()
  const options = [
    {
      value: 'text' as NoticeFormat,
      label: 'Text',
      description: <>Plain text key: value pairs separated by newlines.</>,
    },
    {
      value: 'voevent' as NoticeFormat,
      label: 'VOEvent',
      description: (
        <>
          VOEvent XML. See{' '}
          <a
            rel="external"
            href="http://ivoa.net/Documents/latest/VOEvent.html"
          >
            documentation
          </a>
          .
        </>
      ),
    },
    {
      value: 'binary' as NoticeFormat,
      label: 'Binary',
      description: (
        <>
          160-byte binary format. Field packing is{' '}
          <a
            rel="external"
            href="https://gcn.gsfc.nasa.gov/sock_pkt_def_doc.html"
          >
            specific to each notice type.
          </a>
        </>
      ),
    },
    ...(location.pathname !== '/user/email/edit'
      ? [
          {
            value: 'json' as NoticeFormat,
            label: 'JSON',
            description: (
              <>
                Preliminary new notice types available only via JSON (other
                notice types under development).
              </>
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <input type="hidden" name={name} value={currentValue} />
      <ButtonGroup role="radiogroup" type="segmented">
        {options.map(({ value, label }) => {
          function setHoverToSelf() {
            setHover(value)
          }

          return (
            <Button
              className="display-inline"
              key={value}
              name={name}
              type="button"
              role="radio"
              aria-checked={currentValue === value}
              aria-describedby={`${value}-label`}
              outline={currentValue !== value}
              onClick={() => {
                setCurrentValue(value)
                onChange?.(value)
              }}
              onMouseEnter={setHoverToSelf}
              onMouseOver={setHoverToSelf}
              onFocus={setHoverToSelf}
              onMouseLeave={clearHover}
              onBlur={clearHover}
              onKeyDown={clearHover}
            >
              {label}
            </Button>
          )
        })}
      </ButtonGroup>
      {options.map(({ value, description }) => (
        <div
          role="tooltip"
          key={value}
          id={`${value}-label`}
          hidden={(hover ?? currentValue) !== value}
          className="text-base"
        >
          {description}
        </div>
      ))}
    </>
  )
}
