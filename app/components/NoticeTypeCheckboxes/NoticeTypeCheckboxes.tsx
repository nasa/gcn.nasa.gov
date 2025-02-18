/*!
 * Copyright © 2023 United States Government as represented by the
 * Administrator of the National Aeronautics and Space Administration.
 * All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react'

import type { NoticeFormat } from '../NoticeFormat'
import { NestedCheckboxes } from '../nested-checkboxes/NestedCheckboxes'
import { triggerRate } from './rates'
import { useFeature } from '~/root'

const minRate = 1 / 7

function humanizedCount(count: number, singular: string, plural?: string) {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${noun}`
}

function humanizedRate(rate: number, singular: string, plural?: string) {
  let isUpperBound
  if (rate < minRate) {
    isUpperBound = true
    rate = minRate
  }

  let unit = 'day'
  if (rate) {
    for (const { factor, unit: proposedUnit } of [
      { factor: 1 / 86400, unit: 'second' },
      { factor: 3600, unit: 'hour' },
      { factor: 24, unit: 'day' },
      { factor: 7, unit: 'week' },
      { factor: 4, unit: 'month' },
      { factor: 12, unit: 'year' },
    ]) {
      rate *= factor
      unit = proposedUnit
      if (rate > 0.5) break
    }
  }
  return `${isUpperBound ? '< ' : ''}${humanizedCount(Math.round(rate), singular, plural)} per ${unit}`
}

export const NoticeTypes: { [key: string]: string[] } = {
  AGILE: [
    'AGILE_GRB_GROUND',
    'AGILE_GRB_POS_TEST',
    'AGILE_GRB_REFINED',
    'AGILE_GRB_WAKEUP',
    'AGILE_MCAL_ALERT',
    'AGILE_POINTDIR',
    'AGILE_TRANS',
  ],
  AMON: [
    'AMON_ICECUBE_COINC',
    'AMON_ICECUBE_EHE',
    'AMON_ICECUBE_HESE',
    'AMON_NU_EM_COINC',
  ],
  Calet: ['CALET_GBM_FLT_LC', 'CALET_GBM_GND_LC'],
  Fermi: [
    'FERMI_GBM_ALERT',
    'FERMI_GBM_FIN_POS',
    'FERMI_GBM_FLT_POS',
    'FERMI_GBM_GND_POS',
    'FERMI_GBM_LC',
    'FERMI_GBM_POS_TEST',
    'FERMI_GBM_SUBTHRESH',
    'FERMI_GBM_TRANS',
    'FERMI_LAT_GND',
    'FERMI_LAT_MONITOR',
    'FERMI_LAT_OFFLINE',
    'FERMI_LAT_POS_DIAG',
    'FERMI_LAT_POS_INI',
    'FERMI_LAT_POS_TEST',
    'FERMI_LAT_POS_UPD',
    'FERMI_LAT_TRANS',
    'FERMI_POINTDIR',
    'FERMI_SC_SLEW',
  ],
  GECAM: ['GECAM_FLT', 'GECAM_GND'],
  IceCube: [
    'ICECUBE_ASTROTRACK_BRONZE',
    'ICECUBE_ASTROTRACK_GOLD',
    'ICECUBE_CASCADE',
  ],
  INTEGRAL: [
    'INTEGRAL_OFFLINE',
    'INTEGRAL_POINTDIR',
    'INTEGRAL_REFINED',
    'INTEGRAL_SPIACS',
    'INTEGRAL_WAKEUP',
    'INTEGRAL_WEAK',
  ],
  IPN: ['IPN_POS', 'IPN_RAW', 'IPN_SEG'],
  LVC: [
    'LVC_COUNTERPART',
    'LVC_EARLY_WARNING',
    'LVC_INITIAL',
    'LVC_PRELIMINARY',
    'LVC_RETRACTION',
    'LVC_TEST',
    'LVC_UPDATE',
  ],
  MAXI: ['MAXI_KNOWN', 'MAXI_TEST', 'MAXI_UNKNOWN'],
  Swift: [
    'SWIFT_ACTUAL_POINTDIR',
    'SWIFT_BAT_ALARM_LONG',
    'SWIFT_BAT_ALARM_SHORT',
    'SWIFT_BAT_GRB_ALERT',
    'SWIFT_BAT_GRB_LC',
    'SWIFT_BAT_GRB_LC_PROC',
    'SWIFT_BAT_GRB_POS_ACK',
    'SWIFT_BAT_GRB_POS_NACK',
    'SWIFT_BAT_GRB_POS_TEST',
    'SWIFT_BAT_KNOWN_SRC',
    'SWIFT_BAT_MONITOR',
    'SWIFT_BAT_QL_POS',
    'SWIFT_BAT_SCALEDMAP',
    'SWIFT_BAT_SLEW_POS',
    'SWIFT_BAT_SUB_THRESHOLD',
    'SWIFT_BAT_SUBSUB',
    'SWIFT_BAT_TRANS',
    'SWIFT_FOM_OBS',
    'SWIFT_FOM_PPT_ARG_ERR',
    'SWIFT_FOM_SAFE_POINT',
    'SWIFT_FOM_SLEW_ABORT',
    'SWIFT_POINTDIR',
    'SWIFT_SC_SLEW',
    'SWIFT_TOO_FOM',
    'SWIFT_TOO_SC_SLEW',
    'SWIFT_UVOT_DBURST',
    'SWIFT_UVOT_DBURST_PROC',
    'SWIFT_UVOT_EMERGENCY',
    'SWIFT_UVOT_FCHART',
    'SWIFT_UVOT_FCHART_PROC',
    'SWIFT_UVOT_POS',
    'SWIFT_UVOT_POS_NACK',
    'SWIFT_XRT_CENTROID',
    'SWIFT_XRT_EMERGENCY',
    'SWIFT_XRT_IMAGE',
    'SWIFT_XRT_IMAGE_PROC',
    'SWIFT_XRT_LC',
    'SWIFT_XRT_POSITION',
    'SWIFT_XRT_SPECTRUM',
    'SWIFT_XRT_SPECTRUM_PROC',
    'SWIFT_XRT_SPER',
    'SWIFT_XRT_SPER_PROC',
    'SWIFT_XRT_THRESHPIX',
    'SWIFT_XRT_THRESHPIX_PROC',
  ],
  Other: [
    'AAVSO',
    'ALEXIS_SRC',
    'BRAD_COORDS',
    'CBAT',
    'COINCIDENCE',
    'COMPTEL_SRC',
    'DOW_TOD',
    'GRB_CNTRPART',
    'GRB_COORDS',
    'GRB_FINAL',
    'GWHEN_COINC',
    'HAWC_BURST_MONITOR',
    'HUNTS_SRC',
    'KONUS_LC',
    'MAXBC',
    'MILAGRO_POS',
    'MOA',
    'OGLE',
    'SIMBADNED',
    'SK_SN',
    'SNEWS',
    'SUZAKU_LC',
    'TEST_COORDS',
  ],
}
const NoticeTypeLinks: { [key: string]: string | undefined } = {
  AGILE: 'agile',
  AMON: 'icecube',
  Calet: 'calet',
  Fermi: 'fermi',
  IceCube: 'icecube',
  INTEGRAL: 'integral',
  IPN: '',
  GECAM: 'gecam',
  LVC: 'lvk',
  MAXI: 'maxi',
  Swift: 'swift',
  Other: undefined,
}

export const JsonNoticeTypes: { [key: string]: string[] } = {
  Circulars: ['gcn.circulars'],
  Heartbeat: ['gcn.heartbeat'],
  IceCube: ['gcn.notices.icecube.lvk_nu_track_search'],
  LVK: ['igwn.gwalert'],
  Swift: ['gcn.notices.swift.bat.guano'],
  'Einstein Probe': ['gcn.notices.einstein_probe.wxt.alert'],
}

const JsonNoticeTypeLinks: { [key: string]: string | undefined } = {
  Circulars: '/circulars',
  Heartbeat: '/docs/faq#how-can-i-tell-that-my-kafka-client-is-working',
  IceCube: '/missions/icecube',
  LVK: 'https://emfollow.docs.ligo.org/userguide/tutorial/receiving/gcn.html#receiving-and-parsing-notices',
  Swift: '/missions/swift',
  'Einstein Probe': '/missions/einstein-probe',
}

interface NoticeTypeCheckboxProps {
  defaultSelected?: string[]
  selectedFormat?: NoticeFormat
  validationFunction?: (arg: any) => void
}

export function NoticeTypeCheckboxes({
  defaultSelected,
  selectedFormat = 'text',
  validationFunction,
}: NoticeTypeCheckboxProps) {
  const [userSelected, setUserSelected] = useState(new Set<string>())
  const [selectedCounter, setSelectedCounter] = useState(0)
  const [alertEstimate, setAlertEstimate] = useState(0)

  if (useFeature('SVOM_QUICKSTART')) {
    JsonNoticeTypes.SVOM = ['gcn.notices.svom']
    JsonNoticeTypeLinks.SVOM = '/missions/svom'
  }

  if (useFeature('FERMI_GBM_QUICKSTART')) {
    JsonNoticeTypes.Fermi = ['gcn.notices.fermi.gbm']
    JsonNoticeTypeLinks.Fermi = '/missions/fermi'
  }

  if (useFeature('SUPER_K_QUICKSTART')) {
    JsonNoticeTypes['Super Kamiokande'] = [
      'gcn.notices.superk.sn_alert',
      'gcn.notices.superk.sn_alert.test',
    ]
    JsonNoticeTypeLinks['Super Kamiokande'] = '/missions/sksn'
  }

  if (useFeature('CHIME')) {
    JsonNoticeTypes.Chime = ['gcn.notices.chime.alert']
    JsonNoticeTypeLinks.Chime = '/missions/chime'
  }

  if (useFeature('KM3NET')) {
    JsonNoticeTypes.KM3NET = ['gcn.notices.km3net']
    JsonNoticeTypeLinks.KM3NET = '/missions/km3net'
  }

  const counterfunction = (childRef: HTMLInputElement) => {
    if (childRef.checked) {
      userSelected.add(childRef.name)
    } else {
      userSelected.delete(childRef.name)
    }
    setUserSelected(userSelected)

    setSelectedCounter(userSelected.size)

    let estimate = 0
    for (const noticeType of userSelected) {
      estimate +=
        triggerRate[
          selectedFormat === 'json'
            ? noticeType
            : `gcn.classic.${selectedFormat}.${noticeType}`
        ] ?? 0
    }
    setAlertEstimate(estimate)

    if (validationFunction) {
      validationFunction(selectedCounter)
    }
  }

  return (
    <>
      <NestedCheckboxes
        key={selectedFormat}
        nodes={Object.entries(
          selectedFormat == 'json' ? JsonNoticeTypes : NoticeTypes
        ).map(([mission, noticeTypes]) => ({
          id: mission,
          label: mission,
          name: '',
          link:
            selectedFormat !== 'json'
              ? NoticeTypeLinks[mission]
                ? `/missions/${NoticeTypeLinks[mission]}`
                : undefined
              : JsonNoticeTypeLinks[mission],
          nodes: noticeTypes.map((noticeType) => ({
            id: noticeType,
            label: (
              <>
                {noticeType}
                <div className="padding-left-1 display-inline">
                  <small className="text-base-light">
                    {humanizedRate(
                      triggerRate[
                        selectedFormat === 'json'
                          ? noticeType
                          : `gcn.classic.${selectedFormat}.${noticeType}`
                      ] ?? 0,
                      'alert'
                    )}
                  </small>
                </div>
              </>
            ),
            name: noticeType,
            className: 'sub-option',
            defaultChecked: defaultSelected
              ? defaultSelected.indexOf(noticeType) > -1
              : false,
          })),
        }))}
        childoncheckhandler={counterfunction}
      />
      <div className="text-bold text-ink">
        {humanizedCount(selectedCounter, 'notice type')} selected for{' '}
        {humanizedRate(alertEstimate, 'alert')}
      </div>
    </>
  )
}
