import React, { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../theme/Theme';
import { createStyles } from '../theme/styles';
import { METRICS } from '../theme/tokens';
import { Tactile, useModalAnimation } from './Motion';
import { Mascot } from './Mascot';
import { APP_NAME } from '../constants/appConfig';
export type IconName = keyof typeof Ionicons.glyphMap;
export const useUI = () => { const t = useTheme(); return useMemo(() => createStyles(t), [t]); };
export function Icon({ name, color, small = false }: { name: IconName; color?: string; small?: boolean }) { const t = useTheme(); return <Ionicons name={name} size={small ? METRICS.smallIcon : METRICS.icon} color={color || t.text} />; }
export function IconButton({ name, label, onPress, disabled = false, background = false }: { name: IconName; label: string; onPress: () => void; disabled?: boolean; background?: boolean }) {
  const s = useUI(); return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.iconButton, background && s.iconButtonSurface, { opacity: disabled ? METRICS.disabledOpacity : pressed ? METRICS.opacityPressed : 1 }]}><Icon name={name} /></Pressable>;
}
export function Button({ title, onPress, secondary = false, disabled = false, loading = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; loading?: boolean }) {
  const t = useTheme(), s = useUI(); return <Tactile accessibilityRole="button" accessibilityLabel={title} disabled={disabled || loading} onPress={onPress} style={[s.button, secondary && s.secondaryButton, disabled && { opacity: METRICS.disabledOpacity }]}>{loading && <ActivityIndicator color={secondary ? t.text : t.inverse} />}<Text style={[s.buttonText, secondary && s.secondaryButtonText]}>{title}</Text></Tactile>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) { const t = useTheme(), s = useUI(); return <View><Text style={s.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={t.muted} autoCorrect={false} {...props} style={[s.field, props.style]} /></View>; }
export function Group({ children }: { children: ReactNode }) { const s = useUI(); return <View style={s.group}>{children}</View>; }
export function Section({ title, children, note }: { title?: string; children: ReactNode; note?: string }) { const s = useUI(); return <View style={s.section}>{!!title && <Text style={s.sectionTitle}>{title}</Text>}{children}{!!note && <Text style={s.caption}>{note}</Text>}</View>; }
export function Row({ title, subtitle, icon, right, onPress, danger = false, divider = false }: { title: string; subtitle?: string; icon?: IconName; right?: ReactNode; onPress?: () => void; danger?: boolean; divider?: boolean }) {
  const t = useTheme(), s = useUI(); const content = <><View style={s.row}>{!!icon && <Icon name={icon} color={danger ? t.danger : t.muted} />}<View style={s.rowCopy}><Text style={[s.label, danger && { color: t.danger }]}>{title}</Text>{!!subtitle && <Text style={s.caption}>{subtitle}</Text>}</View>{right || (onPress && <Icon name="chevron-forward" color={t.muted} small />)}</View>{divider && <View style={s.divider} />}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? METRICS.opacityPressed : 1 })}>{content}</Pressable> : <View>{content}</View>;
}
export function Header({ title, back, right }: { title: string; back?: () => void; right?: ReactNode }) { const s = useUI(); return <View style={s.header}>{back && <IconButton name="chevron-back" label="Back" onPress={back} />}<View style={s.headerCenter}><Text numberOfLines={1} style={s.title}>{title}</Text></View>{right}</View>; }
export function Brand({ large = false }: { large?: boolean }) { return <View accessibilityRole="image" accessibilityLabel={`${APP_NAME} mascot`}><Mascot size={large ? METRICS.largeAvatar : METRICS.avatar} /></View>; }
export function SheetModal({ visible, close, children }: { visible: boolean; close: () => void; children: ReactNode }) {
  const s = useUI(), animation = useModalAnimation(visible, 'slide'), insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType={animation} onRequestClose={close}><KeyboardAvoidingView style={[s.modalOverlay, { paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{children}</KeyboardAvoidingView></Modal>;
}
