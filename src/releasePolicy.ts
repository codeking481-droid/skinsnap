export function developmentAnalysisEnabled(isDevelopmentBuild: boolean, configuredFlag: string | undefined): boolean {
  return isDevelopmentBuild && configuredFlag === 'true';
}
