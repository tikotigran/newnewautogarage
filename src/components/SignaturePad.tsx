import React, { useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenTool, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { pickLocalized } from '../utils/i18nUtils';

interface SignaturePadProps {
  value?: string;
  onSave: (dataUrl: string) => void | Promise<void>;
  onClearSaved?: () => void | Promise<void>;
  isSaving?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value = '',
  onSave,
  onClearSaved,
  isSaving = false,
}) => {
  const { lang } = useI18n();
  const L = <T,>(fr: T, ru: T, hy: T, ka: T) => pickLocalized(lang, { fr, ru, hy, ka });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const getLogicalCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture?.(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getLogicalCoords(e);
    isDrawingRef.current = true;
    lastPointRef.current = pt;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    setHasStroke(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const last = lastPointRef.current;
    if (!canvas || !last) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getLogicalCoords(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    if (!hasStroke) setHasStroke(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore if pointer capture not active
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const handleSaveCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    const dataUrl = canvas.toDataURL('image/png');
    await onSave(dataUrl);
    handleClearCanvas();
  };

  return (
    <div className="space-y-3" data-testid="signature-pad-container">
      {/* Canvas drawing box */}
      <div className="relative rounded-xl border border-slate-700 bg-slate-50 overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          data-testid="signature-pad-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-36 sm:h-40 block cursor-crosshair touch-none select-none"
        />
        {!hasStroke && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <PenTool className="w-4 h-4 mb-1 opacity-60" />
            <span className="text-xs font-medium">
              {L(
                'Dessinez votre signature ici (souris ou tactile)',
                'Нарисуйте подпись здесь (мышью или пальцем)',
                'Նկարեք Ձեր ստորագրությունը այստեղ',
                'დახაზეთ ხელმოწერა აქ'
              )}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute left-6 right-6 bottom-5 border-b border-dashed border-slate-300" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="signature-pad-clear-btn"
            onClick={handleClearCanvas}
            disabled={!hasStroke || isSaving}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>{L('Effacer', 'Очистить', 'Մաքրել', 'გასუფთავება')}</span>
          </button>

          <button
            type="button"
            data-testid="signature-pad-save-btn"
            onClick={handleSaveCanvas}
            disabled={!hasStroke || isSaving}
            className="h-8 px-3.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>
              {L(
                'Enregistrer la signature',
                'Сохранить подпись',
                'Պահպանել ստորագրությունը',
                'ხელმოწერის შენახვა'
              )}
            </span>
          </button>
        </div>

        {value && onClearSaved && (
          <button
            type="button"
            data-testid="signature-pad-remove-saved-btn"
            onClick={() => onClearSaved()}
            disabled={isSaving}
            className="h-8 px-3 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{L('Supprimer la signature', 'Удалить подпись', 'Հեռացնել ստորագրությունը', 'ხელმოწერის წაშლა')}</span>
          </button>
        )}
      </div>

      {value && (
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block">
              {L('Signature active (pré-remplie sur PDF)', 'Активная подпись (добавляется в PDF)', 'Ակտիվ ստորագրություն', 'აქტიური ხელმოწერა')}
            </span>
            <p className="text-[11px] text-slate-400">
              {L(
                'Appliquée automatiquement sur vos factures et certificats Cerfa.',
                'Автоматически подставляется в счета-фактуры и бланки Cerfa.',
                'Ավտոմատ կիրառվում է հաշիվ-ապրանքագրերում և Cerfa ձևաթղթերում։',
                'ავტომატურად ემატება ინვოისებსა და Cerfa ფორმებში.'
              )}
            </p>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 border border-slate-300 shrink-0">
            <img
              src={value}
              alt="Signature"
              data-testid="signature-saved-preview"
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
