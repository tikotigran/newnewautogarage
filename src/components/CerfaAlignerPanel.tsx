import React, { useState, useCallback, useMemo } from 'react';
import { Check, RotateCcw, Loader2, Sliders, Save } from 'lucide-react';
import { Cerfa15776FormData } from '../utils/cerfa15776';
import {
  CERFA_ALIGNER_FIELDS,
  Cerfa15776Config,
  CerfaEditableFieldValues,
  cloneCerfaConfig,
  getCerfa15776FieldAtPath,
  updateCerfa15776FieldAtPath,
} from '../utils/cerfaConfig';
import { buildCerfa15776PdfBytes } from '../utils/pdfGenerator';
import { CerfaLivePreviewSheet } from './CerfaLivePreviewSheet';

interface CerfaAlignerPanelProps {
  formData: Cerfa15776FormData;
  config: Cerfa15776Config;
  onConfigChange: (next: Cerfa15776Config) => void;
  onSaveCalibration?: (cfg: Cerfa15776Config) => Promise<void>;
  isSavingCalibration?: boolean;
  saveNotice?: string | null;
}

export const CerfaAlignerPanel: React.FC<CerfaAlignerPanelProps> = ({
  formData,
  config,
  onConfigChange,
  onSaveCalibration,
  isSavingCalibration = false,
  saveNotice = null,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>(CERFA_ALIGNER_FIELDS[0].path);
  const [copied, setCopied] = useState(false);

  const activeField = getCerfa15776FieldAtPath(config, selectedPath);
  const activeFieldMeta = useMemo(
    () => CERFA_ALIGNER_FIELDS.find((f) => f.path === selectedPath),
    [selectedPath]
  );

  const generatePdfBytes = useCallback(
    () =>
      buildCerfa15776PdfBytes(formData, config, {
        highlightedFieldPath: selectedPath,
        showCalibrationPlaceholderForSelected: true,
      }),
    [formData, config, selectedPath]
  );

  const previewDependencyKey = useMemo(
    () => JSON.stringify({ formData, config, selectedPath }),
    [formData, config, selectedPath]
  );

  const updateActiveField = (patch: Partial<CerfaEditableFieldValues>) => {
    onConfigChange(updateCerfa15776FieldAtPath(config, selectedPath, patch));
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

        {/* Save to Cloud (SuperAdmin) + Copy Config */}
        <div className="space-y-2 pt-2">
          {saveNotice && (
            <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{saveNotice}</span>
            </div>
          )}
          {onSaveCalibration && (
            <button
              type="button"
              data-testid="aligner-save-cloud-btn"
              disabled={isSavingCalibration}
              onClick={() => void onSaveCalibration(config)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 transition flex items-center justify-center gap-2 shadow-lg"
            >
              {isSavingCalibration ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Сохранить</span>
            </button>
          )}
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
      </div>

      {/* Right: Real-time Live PDF Preview (pdfjs canvas rendered — iframe-safe) */}
      <div className="lg:col-span-8 min-h-0 flex flex-col">
        <CerfaLivePreviewSheet
          title="Живой предпросмотр Cerfa N° 15776*02"
          activeFieldLabel={activeFieldMeta?.label}
          generatePdfBytes={generatePdfBytes}
          dependencyKey={previewDependencyKey}
          testIdPrefix="cerfa-aligner"
          heightClassName="h-full min-h-[480px]"
        />
      </div>
    </div>
  );
};
