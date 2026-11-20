// Módulos de servidor que a demo nunca usa (arquivos, SDKs da AWS e do Neon). Qualquer uso falha na hora.
const unavailable = () => {
  throw new Error("not available in the demo");
};
export const readdirSync = unavailable;
export const readFileSync = unavailable;
export class BedrockRuntimeClient {
  constructor() {
    unavailable();
  }
}
export const InvokeModelCommand = BedrockRuntimeClient;
export const InvokeModelWithResponseStreamCommand = BedrockRuntimeClient;
export default {};
