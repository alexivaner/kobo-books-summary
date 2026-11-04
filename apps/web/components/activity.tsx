"use client";
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { HeatmapChart } from "echarts/charts";
import {
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([
  HeatmapChart,
  CalendarComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);
export default function Activity({ entries }: { entries: [string, number][] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const end = new Date(),
      start = new Date();
    start.setMonth(start.getMonth() - 5);
    chart.setOption({
      animation: false,
      tooltip: {
        formatter: (p: unknown) => {
          const d = (p as { data?: [string, number] }).data;
          return d ? `${d[0]} · ${Math.round(d[1] / 60)} recorded minutes` : "";
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: 7200,
        inRange: {
          color: ["#e9eee6", "#c8d9ba", "#91b17e", "#5e8651", "#345c3a"],
        },
      },
      calendar: {
        top: 26,
        left: 32,
        right: 12,
        bottom: 12,
        cellSize: ["auto", 15],
        range: [
          start.toISOString().slice(0, 10),
          end.toISOString().slice(0, 10),
        ],
        splitLine: { show: false },
        itemStyle: {
          borderColor: "transparent",
          borderWidth: 3,
          color: "#e9eee6",
        },
        yearLabel: { show: false },
        dayLabel: {
          firstDay: 1,
          color: "#82897d",
          fontSize: 9,
          nameMap: ["S", "M", "T", "W", "T", "F", "S"],
        },
        monthLabel: { color: "#82897d", fontSize: 10 },
      },
      series: [
        { type: "heatmap", coordinateSystem: "calendar", data: entries },
      ],
    });
    const obs = new ResizeObserver(() => chart.resize());
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      chart.dispose();
    };
  }, [entries]);
  return (
    <div
      role="img"
      aria-label={`Recorded reading activity across ${entries.length} days`}
      ref={ref}
      style={{ height: 165, width: "100%" }}
    />
  );
}
