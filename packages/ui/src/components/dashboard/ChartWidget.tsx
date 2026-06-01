// @ilaunchify/ui — ChartWidget.
//
// Thin wrapper that hosts a chart primitive (ChartArea / ChartBar /
// ChartDonut / ChartLine) inside the base <Widget> shell. The chart
// primitive is passed via children; this variant exists mostly so the
// admin/partner/creator dashboards have a recognizable name when reading
// the JSX ("ChartWidget" reads more semantically than "Widget").
//
// Adds nothing beyond the base shell — kept thin so future chrome
// changes (caption row, hover state) flow through here without leaking
// into the chart primitives themselves.

import * as React from 'react'
import { Widget, type WidgetProps } from './Widget'

export type ChartWidgetProps = WidgetProps

export function ChartWidget(props: ChartWidgetProps) {
  return <Widget {...props} />
}
