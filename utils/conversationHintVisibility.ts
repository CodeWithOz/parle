import { AppState } from '../types';

export function shouldSetHintFromResponse(
  scenarioMode: string,
  hint: string | undefined | null
): boolean {
  return scenarioMode === 'practice' && !!hint;
}

export function isConversationHintVisible(
  scenarioMode: string,
  appState: AppState
): boolean {
  return (
    scenarioMode === 'practice' &&
    (appState === AppState.IDLE || appState === AppState.RECORDING)
  );
}
