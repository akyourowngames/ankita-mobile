import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../core/AppContext';
import type { ToolReceipt } from '../assistant/types';
import { Button, Header, Icon, IconButton, SheetModal, useUI } from './UI';
import { useTheme } from '../theme/Theme';
import { METRICS, SPACING } from '../theme/tokens';
import { summarizeActivity, TOOL_STATUS_COPY } from '../core/activitySummary';

const local = StyleSheet.create({ activity: { minHeight: METRICS.touch, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm }, copy: { flex: 1, flexShrink: 1 } });

export function ApprovalSheet() {
  const app = useApp(), s = useUI(), request = app.approvals[0];
  const decline = () => { if (request) app.resolveApproval(request.id, false); };
  const allowAlways = () => { if (!request) return; void app.allowApprovalTool(request.id, request.name).catch(() => app.resolveApproval(request.id, false)); };
  const canPersist = request?.scope === 'tool';
  return <SheetModal visible={!!request} close={decline}><Pressable style={s.flex} accessibilityLabel="Decline pending action" onPress={decline} /><View style={s.sheet}><View style={s.sheetHandle} /><Header title="Review action" right={<IconButton name="close" label="Close action review" onPress={decline} />} /><ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}><Text style={s.title}>{request?.title}</Text><Text style={s.caption}>{request?.description}</Text><View style={s.code}><Text selectable style={s.codeText}>{request?.arguments}</Text></View><Text style={s.caption}>{canPersist ? `Always allow runs ${request?.title} without asking. You can change or disable it in Tools & permissions.` : 'This approval applies to this action only.'}</Text><Button title="Allow once" onPress={() => { if (request) app.resolveApproval(request.id, true); }} />{canPersist && <Button title="Always allow" secondary onPress={allowAlways} />}<Button title="Decline action" secondary onPress={decline} /><Button title="Stop assistant" secondary onPress={app.stop} /></ScrollView></View></SheetModal>;
}

export function ToolActivity({ receipts }: { receipts: ToolReceipt[] }) {
  const [open, setOpen] = useState(false), s = useUI(), t = useTheme();
  const summary = summarizeActivity(receipts);
  if (!summary) return null;
  const { latest } = summary;
  const working = latest.status === 'waiting' || latest.status === 'running';
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel="Tool activity" accessibilityHint={summary.label} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [local.activity, pressed && s.navigationPressed]}>
      <Icon small name={summary.attention ? 'alert-circle-outline' : working ? 'time-outline' : latest.status === 'succeeded' ? 'checkmark-circle-outline' : 'information-circle-outline'} color={t.muted} />
      <Text style={[s.caption, local.copy]}>{summary.label}</Text>
      <Icon name="chevron-forward" small color={t.muted} />
    </Pressable>
    <SheetModal visible={open} close={() => setOpen(false)}>
      <Pressable style={s.flex} onPress={() => setOpen(false)} accessibilityLabel="Dismiss tool activity" />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Header title="Tool activity" right={<IconButton name="close" label="Close tool activity" onPress={() => setOpen(false)} />} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.toolDetails}>
          {receipts.map(item => <View key={item.id} style={s.toolDetailCard}>
            <View style={s.toolDetailHeading}><Text style={[s.toolCardTitle, s.flex]}>{item.title}</Text><Text style={[s.toolCardMeta, item.status === 'succeeded' && { color: t.success }]}>{TOOL_STATUS_COPY[item.status]}</Text></View>
            <Text style={s.toolCardMeta}>{item.name}</Text>
            <View style={s.toolDetailSection}><Text style={s.toolDetailLabel}>Input</Text><View style={s.code}><Text selectable style={s.codeText}>{item.arguments}</Text></View></View>
            {!!item.result && <View style={s.toolDetailSection}><Text style={s.toolDetailLabel}>Result</Text><View style={s.code}><Text selectable style={s.codeText}>{item.result}</Text></View></View>}
          </View>)}
        </ScrollView>
      </View>
    </SheetModal>
  </View>;
}
