import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, RotateCcw, Loader2, Sliders } from 'lucide-react';
import { Cerfa15776FormData } from '../utils/cerfa15776';
import {
  CERFA_ALIGNER_FIELDS,
  Cerfa15776Config,
  cloneCerfaConfig,
} from '../utils/cerfaConfig';
import { buildCerfa15776PdfBytes } from '../utils/pdfGenerator';

interface CerfaAlignerPanelProps {
  formData: Cerfa15776FormData;
  config: Cerfa15776Config;
  onConfigChange: (next: Cerfa15776Config) => void;
}

interface EditableFieldValues {
  x: number;
  y: number;
  size: number;
  stepX?: number;
}

function getFieldAtPath(config: Cerfa15776Config, path: string): EditableFieldValues {
  const parts = path.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current as EditableFieldValues;
}

function setFieldAtPath(
  config: Cerfa15776Config,
  path: string,
  patch: Partial<EditableFieldValues>
): Cerfa15776Config {
  const next = JSON.parse(JSON.stringify(config)) as Cerfa15776Config;
  const parts = path.split('.');
  let current: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    current = current[parts[i]] as Record<string, unknown>;
  }
  const leafKey = parts[parts.length - 1];
  current[leafKey] = {
    ...(current[leafKey] as Record<string, unknown>),
    ...patch,
  };
  return next;
}

export const CerfaAlignerPanel: React.FC<CerfaAlignerPanelProps> = ({
  formData,
  config,
  onConfigChange,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>(CERFA_ALIGNER_FIELDS[0].path);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeUrlRef = useRef<string | null>(null);

  const activeField = getFieldAtPath(config, selectedPath);

  // Re-render live PDF preview whenever config or formData changes
  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);

    const timer = setTimeout(async () => {
      try {
        const bytes = await buildCerfa15776PdfBytes(formData, config);
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        const nextUrl = URL.createObjectURL(blob);
        if (activeUrlRef.current) {
          URL.revokeObjectURL(activeUrlRef.current);
        }
        activeUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
      } catch (err) {
        console.error('Aligner preview render error:', err);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData, config]);

  // Cleanup Blob URL on unmount
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
      }
    };
  }, []);

  const updateActiveField = (patch: Partial<EditableFieldValues>) => {
    onConfigChange(setFieldAtPath(config, selectedPath, patch));
  };

  const nudge = (axis: 'x' | 'y', delta: number) => {
    const currentVal = activeField[axis];
    const nextVal = Math.round((currentVal + delta) * 10) / 10;
    updateActiveField({ [axis]: nextVal });
  };

  const handleCopyConfig = async () => {
    const tsPayload = `export const CERFA_15776_CONFIG = ${JSON.stringify(config, null, 2)} as const;`;
    try {
      await navigator.clipboard.writeText(tsPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      console.log(tsPayload);
    }
  };

  const sections = Array.from(new Set(CERFA_ALIGNER_FIELDS.map((f) => f.section)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[68vh] min-h-[480px]">
      {/* Left: Interactive Coordinate Controls */}
      <div className="lg:col-span-4 bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between overflow-y-auto space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-amber-400">
              <Sliders className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Калибровка полей (pt)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onConfigChange(cloneCerfaConfig())}
              className="text-[11px] font-semibold text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Сбросить</span>
            </button>
          </div>

          {/* Field Selector */}
          <div>
            <label htmlFor="aligner-field-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
              Выберите поле Cerfa 15776*02
            </label>
            <select
              id="aligner-field-select"
              value={selectedPath}
              onChange={(e) => setSelectedPath(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              {sections.map((sec) => (
                <optgroup key={sec} label={sec}>
                  {CERFA_ALIGNER_FIELDS.filter((f) => f.section === sec).map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* X Coordinate */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="aligner-x-input" className="text-xs font-bold text-slate-200">
                Позиция X (горизонталь)
              </label>
              <input
                id="aligner-x-input"
                type="number"
                step={0.5}
                value={activeField.x}
                onChange={(e) => updateActiveField({ x: Number(e.target.value) || 0 })}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right font-mono text-amber-400"
              />
            </div>
            <input
              type="range"
              min={0}
              max={595}
              step={0.5}
              value={activeField.x}
              onChange={(e) => updateActiveField({ x: Number(e.target.value) })}
              aria-label="Слайдер X"
              className="w-full accent-amber-500"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={`x-${delta}`}
                  type="button"
                  onClick={() => nudge('x', delta)}
                  className="py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>

          {/* Y Coordinate */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="aligner-y-input" className="text-xs font-bold text-slate-200">
                Позиция Y (вертикаль)
              </label>
              <input
                id="aligner-y-input"
                type="number"
                step={0.5}
                value={activeField.y}
                onChange={(e) => updateActiveField({ y: Number(e.target.value) || 0 })}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right font-mono text-blue-400"
              />
            </div>
            <input
              type="range"
              min={0}
              max={842}
              step={0.5}
              value={activeField.y}
              onChange={(e) => updateActiveField({ y: Number(e.target.value) })}
              aria-label="Слайдер Y"
              className="w-full accent-blue-500"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={`y-${delta}`}
                  type="button"
                  onClick={() => nudge('y', delta)}
                  className="py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size & Comb stepX */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5">
              <label htmlFor="aligner-size-input" className="block text-[11px] font-semibold text-slate-400 mb-1">
                Размер шрифта (pt)
              </label>
              <input
                id="aligner-size-input"
                type="number"
                step={0.5}
                min={5}
                max={16}
                value={activeField.size}
                onChange={(e) => updateActiveField({ size: Number(e.target.value) || 8 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
              />
            </div>
            {typeof activeField.stepX === 'number' && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5">
                <label htmlFor="aligner-stepx-input" className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Шаг ячеек (stepX)
                </label>
                <input
                  id="aligner-stepx-input"
                  type="number"
                  step={0.1}
                  min={5}
                  max={30}
                  value={activeField.stepX}
                  onChange={(e) => updateActiveField({ stepX: Number(e.target.value) || 12 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white"
                />
              </div>
            )}
          </div>
        </div>

        {/* Export / Copy Config Button */}
        <button
          type="button"
          onClick={handleCopyConfig}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center justify-center gap-2 shadow-lg"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>Конфиг скопирован!</span>
            </>
          ) : (
            <span>📋 Копировать конфиг (Copy JSON)</span>
          )}
        </button>
      </div>

      {/* Right: Real-time Live PDF Preview */}
      <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative flex flex-col">
        <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/70 flex items-center justify-between text-xs text-slate-400">
          <span>Живой предпросмотр Cerfa N° 15776*02</span>
          {isRendering && (
            <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Обновление...</span>
            </span>
          )}
        </div>
        {previewUrl ? (
          <iframe
            title="Cerfa 15776*02 Live Preview"
            src={`${previewUrl}#toolbar=0&navpanes=0`}
            className="w-full flex-1 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span>Загрузка предпросмотра PDF...</span>
          </div>
        )}
      </div>
    </div>
  );
};
