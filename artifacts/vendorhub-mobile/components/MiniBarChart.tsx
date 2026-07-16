/**
 * Lightweight native bar chart — no external library.
 * Props: data array of { label, value } and a barColor.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface BarDatum {
  label: string;
  value: number;
}

interface Props {
  data: BarDatum[];
  barColor?: string;
  height?: number;
  prefix?: string;
  suffix?: string;
}

export function MiniBarChart({ data, barColor, height = 100, prefix = '', suffix = '' }: Props) {
  const colors = useColors();
  const bar = barColor ?? colors.primary;

  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={[styles.container, { height }]}>
      {/* Y-axis hint */}
      <View style={styles.yAxis}>
        <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>
          {prefix}{max >= 1000 ? `${(max / 1000).toFixed(1)}k` : max.toFixed(0)}{suffix}
        </Text>
        <Text style={[styles.axisLabel, { color: colors.mutedForeground }]}>0</Text>
      </View>

      {/* Bars */}
      <View style={styles.barsArea}>
        {data.map((d, i) => {
          const barH = max > 0 ? ((d.value / max) * (height - 28)) : 0;
          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    { height: barH, backgroundColor: bar, opacity: 0.85 + (i / data.length) * 0.15 },
                  ]}
                />
              </View>
              <Text style={[styles.xLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  yAxis: {
    width: 32,
    justifyContent: 'space-between',
    paddingBottom: 18,
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  axisLabel: {
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
  },
  barsArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingBottom: 18,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
  },
  barWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
    width: '100%',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  xLabel: {
    fontSize: 8,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
});
