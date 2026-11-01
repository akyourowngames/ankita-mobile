import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Brand, Button, Field, IconButton, Row, useUI } from '../components/UI';
import { Scene } from '../components/Motion';
import { Mascot } from '../components/Mascot';
import { APP_NAME } from '../constants/appConfig';
import { PHONE } from '../theme/tokens';
import { useApp } from '../core/AppContext';
import { useTheme } from '../theme/Theme';

const STEPS = ['welcome', 'name', 'connect'] as const;
export function OnboardingScreen() {
  const app = useApp(), t = useTheme(), s = useUI(), [step, setStep] = useState<typeof STEPS[number]>('welcome');
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={[s.onboarding, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={s.onboardingTop}><View style={s.hstack}><Brand /><Text style={s.label}>{APP_NAME}</Text></View><View accessibilityLabel={`Step ${STEPS.indexOf(step) + 1} of ${STEPS.length}`} style={s.progress}>{STEPS.map((item, index) => <View key={item} style={[s.progressSegment, index <= STEPS.indexOf(step) && { backgroundColor: t.accent }]} />)}</View></View>
    <Scene scene={step}>
      <View style={[s.flex, s.gap, { justifyContent: 'center' }]}>
        <Mascot size={PHONE.heroMascot} />
        {step === 'welcome' ? <View style={s.onboardingCopy}><Text style={s.hero}>Your teammates.{ '\n' }In your pocket.</Text><Text style={s.secondary}>Chat, work through ideas and use your connected apps. The same Ankita feel, made for your phone.</Text></View>
          : step === 'name' ? <View style={s.onboardingCopy}><Text style={s.hero}>What should we{ '\n' }call you?</Text><Text style={s.secondary}>Your name stays on this device.</Text><Field label="Your name" placeholder="First name" value={app.state.settings.name} onChangeText={name => app.patchSettings({ name })} autoCapitalize="words" autoComplete="given-name" /></View>
            : <View style={s.onboardingCopy}><Text style={s.hero}>Choose your AI.</Text><Text style={s.secondary}>Connect your provider, then choose a model. You can change both in Settings.</Text><View style={s.group}><Row title={app.state.providers.length ? 'Provider added' : 'Choose an AI provider'} subtitle={app.state.providers.length ? app.state.providers.map(p => p.name).join(', ') : 'Use an existing account or local endpoint'} icon="layers-outline" onPress={() => app.navigate('providers')} /></View></View>}
      </View>
    </Scene>
    <View style={s.smallGap}>
      <Button title={step === 'welcome' ? 'Get started' : step === 'name' ? 'Continue' : app.state.providers.length ? 'Start chatting' : 'Set up my provider'} onPress={() => step === 'welcome' ? setStep('name') : step === 'name' ? setStep('connect') : app.state.providers.length ? app.finishOnboarding() : app.navigate('providers')} />
      {step === 'name' && <Button title="Go back" secondary onPress={() => setStep('welcome')} />}
      {step === 'connect' && !app.state.providers.length && <Button title="I’ll do this later" secondary onPress={app.finishOnboarding} />}
      <Text style={s.bottomNote}>No {APP_NAME} account required.</Text>
    </View>
  </ScrollView></KeyboardAvoidingView>;
}
