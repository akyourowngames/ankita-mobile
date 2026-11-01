const { withGradleProperties } = require('expo/config-plugins');
// AsyncStorage's default 6 MB database is smaller than this app's allowed library
// plus chat history, so large saves fail silently on Android. Raise the ceiling.
const SIZE_MB = '64';

module.exports = config => withGradleProperties(config, mod => {
  const next = mod.modResults.filter(item => !(item.type === 'property' && item.key === 'AsyncStorage_db_size_in_MB'));
  next.push({ type: 'property', key: 'AsyncStorage_db_size_in_MB', value: SIZE_MB });
  mod.modResults = next;
  return mod;
});
