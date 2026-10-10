import { useCallback, useEffect, useRef, useState } from "react";

import { useAppState } from "@/lib/storage";

/** Escolhe a voz que melhor casa com o sotaque (en-AU → en-AU, senão qualquer en-*). */
function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const norm = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => norm(v) === lang.toLowerCase()) ??
    voices.find((v) => norm(v).startsWith("en")) ??
    undefined
  );
}

/**
 * TTS do navegador. O sotaque vem dos Ajustes (en-AU por padrão) — todos os motores
 * herdam isso. No Chrome `getVoices()` pode vir vazio na primeira chamada; esperamos
 * o evento `voiceschanged` (com limite) antes de falar.
 */
export function useSpeechSynthesis() {
  const { settings } = useAppState();
  const lang = settings.accent;
  // SSR e a primeira renderização do cliente devem concordar (hidratação):
  // `supported` só vira true após montar, via effect.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);
  const [speaking, setSpeaking] = useState(false);
  const token = useRef(0);

  const cancel = useCallback(() => {
    token.current += 1;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, rate = 1) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const mine = ++token.current;
      setSpeaking(true);

      const run = () => {
        if (token.current !== mine) return; // outro speak/cancel chegou antes
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        const voice = pickVoice(synth.getVoices(), lang);
        if (voice) utterance.voice = voice;
        utterance.onend = () => {
          if (token.current === mine) setSpeaking(false);
        };
        utterance.onerror = () => {
          if (token.current === mine) setSpeaking(false);
        };
        synth.speak(utterance);
      };

      if (synth.getVoices().length > 0) {
        run();
        return;
      }
      let done = false;
      const go = () => {
        if (done) return;
        done = true;
        synth.removeEventListener("voiceschanged", go);
        run();
      };
      synth.addEventListener("voiceschanged", go);
      window.setTimeout(go, 600); // sem vozes (ou evento nunca chega): fala com o padrão do navegador
    },
    [lang],
  );

  useEffect(() => cancel, [cancel]);

  return { supported, speaking, speak, cancel };
}
