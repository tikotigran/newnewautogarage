import React, { useState } from 'react';
import {
  Smartphone,
  Car,
  Wrench,
  TrendingUp,
  ListCheck,
  CheckCircle2,
  Clock,
  Code,
  Copy,
  Check,
  ChevronRight,
  Plus,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Vehicle, RepairTask, GeneralExpense } from '../types/garage';
import { formatEuro } from '../utils/finance';
import { updateRepairTask } from '../services/garageService';
import { useI18n } from '../i18n/I18nContext';

interface MobileSimulatorProps {
  vehicles: Vehicle[];
  userId: string;
  onOpenVehicleModal: () => void;
}

export const MobileSimulator: React.FC<MobileSimulatorProps> = ({
  vehicles,
  userId,
  onOpenVehicleModal,
}) => {
  const { t, lang } = useI18n();
  const [mobileTab, setMobileTab] = useState<'fleet' | 'mechanic' | 'pnl' | 'sourceCode'>('fleet');
  const [selectedMobileVehicle, setSelectedMobileVehicle] = useState<Vehicle | null>(
    vehicles[0] || null
  );
  const [copiedCode, setCopiedCode] = useState(false);

  // Sample React Native Expo code export for users
  const reactNativeExpoCode = `// AutoGarage Manager - React Native (Expo) Mobile App
// App.tsx - Shared Firebase Firestore Backend Architecture

import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, SafeAreaView, StatusBar, Image } from 'react-native';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0991582754",
  apiKey: "AIzaSyDkBJ_8rMi7jpz9iMAM3NonhZQKJmES8RQ",
  firestoreDatabaseId: "ai-studio-032a65ec-8c40-4191-badb-5e3c9b87e4c5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const userId = "${userId || 'garage_demo_user'}";

  useEffect(() => {
    const q = query(collection(db, 'vehicles'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
      setVehicles(list);
    });
    return () => unsubscribe();
  }, [userId]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>AutoGarage Mobile</Text>
        <Text style={styles.subtitle}>{vehicles.length} Véhicules en temps réel</Text>
      </View>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.carName}>{item.make} {item.model} ({item.year})</Text>
            <Text style={styles.vin}>VIN: {item.vin} • {item.mileage} km</Text>
            <View style={styles.row}>
              <Text style={styles.badge}>{item.status}</Text>
              <Text style={styles.profit}>Marge: +{item.netProfit} €</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  header: { padding: 16, borderBottomWidth: 1, borderColor: '#1e293b' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#f59e0b' },
  subtitle: { fontSize: 12, color: '#94a3b8' },
  card: { backgroundColor: '#0f172a', padding: 14, margin: 12, borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  carName: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  vin: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' },
  badge: { backgroundColor: '#1e293b', color: '#38bdf8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 11, fontWeight: 'bold' },
  profit: { color: '#34d399', fontWeight: 'bold', fontSize: 14 }
});
`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(reactNativeExpoCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const currentVehicle = selectedMobileVehicle || vehicles[0];

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      {/* Introduction banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              {t('mobileCompanionTitle')}
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                LIVE DUAL-SYNC
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              {t('mobileCompanionDesc')}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMobileTab('sourceCode')}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 transition flex items-center gap-1.5 shrink-0"
        >
          <Code className="w-3.5 h-3.5" />
          <span>{t('exportReactNativeCode')}</span>
        </button>
      </div>

      {/* Center Phone Frame */}
      <div className="flex justify-center">
        <div className="w-[360px] sm:w-[380px] h-[720px] bg-slate-950 rounded-[44px] p-3 shadow-2xl border-4 border-slate-700 relative flex flex-col overflow-hidden">
          {/* Top Speaker & Camera Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-5 bg-slate-800 rounded-b-2xl z-30 flex items-center justify-center">
            <div className="w-12 h-1.5 bg-slate-950 rounded-full"></div>
            <div className="w-2.5 h-2.5 bg-slate-900 rounded-full ml-3 border border-slate-700"></div>
          </div>

          {/* Phone Inner Display */}
          <div className="flex-1 bg-slate-900 rounded-[34px] overflow-hidden flex flex-col pt-5">
            {/* Mobile Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs">
                  AG
                </div>
                <div>
                  <h3 className="font-extrabold text-xs text-white">AutoGarage Mobile</h3>
                  <p className="text-[10px] text-slate-400">{t('vehiclesCount', { count: vehicles.length })}</p>
                </div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>

            {/* Mobile Body Content based on active mobile tab */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-none">
              {mobileTab === 'fleet' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">{t('mobileLotTitle', { count: vehicles.length })}</span>
                    <button
                      onClick={onOpenVehicleModal}
                      className="text-[11px] text-amber-400 font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      {lang === 'ru' ? 'Добавить' : 'Ajouter'}
                    </button>
                  </div>

                  {vehicles.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        setSelectedMobileVehicle(v);
                        setMobileTab('mechanic');
                      }}
                      className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2 cursor-pointer hover:border-amber-500/50 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-xs text-white block">
                            {v.make} {v.model}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {v.vin} • {v.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
                          {v.status === 'preparation'
                            ? t('statusPreparation')
                            : v.status === 'repair'
                            ? t('statusRepair')
                            : v.status === 'for_sale'
                            ? t('statusForSale')
                            : t('statusSold')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-900">
                        <span className="text-slate-400">{t('totalCapitalInvestedLabel')} :</span>
                        <span className="text-white font-bold">{formatEuro(v.totalInvested)}</span>
                        <span className="text-emerald-400 font-extrabold">
                          +{formatEuro(v.netProfit)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {mobileTab === 'mechanic' && currentVehicle && (
                <div className="space-y-3">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider block">
                      {t('mobileMechanicTitle')}
                    </span>
                    <h4 className="font-bold text-xs text-white">
                      {currentVehicle.make} {currentVehicle.model} ({currentVehicle.year})
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {currentVehicle.vin} • {currentVehicle.mileage.toLocaleString(lang === 'ru' ? 'ru-RU' : 'fr-FR')} km
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">{t('mobileChecklistTitle')}</span>
                    <span className="text-[10px] text-slate-500">{t('tapToToggle')}</span>
                  </div>

                  {/* Quick interactive checklist items */}
                  <div className="space-y-2">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-slate-300">{lang === 'ru' ? 'Замена масла и фильтров' : 'Vidange & Filtres'}</span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-bold">{t('taskDone')}</span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-slate-300">{lang === 'ru' ? 'Тормозные диски и колодки' : 'Disques & Plaquettes avant'}</span>
                      </div>
                      <span className="text-[11px] text-blue-400 font-bold">{t('taskInProgress')}</span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-600"></div>
                        <span className="text-slate-300">{lang === 'ru' ? 'Прохождение техосмотра' : 'Passage Contrôle Technique'}</span>
                      </div>
                      <span className="text-[11px] text-amber-400 font-bold">{t('taskTodo')}</span>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border border-slate-600"></div>
                        <span className="text-slate-300">{lang === 'ru' ? 'Детейлинг и полировка' : 'Detailing & Lustrage'}</span>
                      </div>
                      <span className="text-[11px] text-amber-400 font-bold">{t('taskTodo')}</span>
                    </div>
                  </div>
                </div>
              )}

              {mobileTab === 'pnl' && (
                <div className="space-y-3">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      {t('globalFleetMargin')}
                    </span>
                    <div className="text-2xl font-black text-emerald-400">
                      +{formatEuro(vehicles.reduce((acc, v) => acc + (v.netProfit || 0), 0))}
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      {t('onVehiclesEntered', { count: vehicles.length })}
                    </span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2 text-xs">
                    <span className="font-bold text-white block mb-1">{t('capitalDetails')}</span>
                    <div className="flex justify-between text-slate-400">
                      <span>{t('totalVehiclesBought')}</span>
                      <span className="text-white font-bold">
                        {formatEuro(vehicles.reduce((acc, v) => acc + (v.purchasePrice || 0), 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{t('totalPartsAndLabor')}</span>
                      <span className="text-amber-400 font-bold">
                        {formatEuro(vehicles.reduce((acc, v) => acc + (v.repairCostTotal || 0), 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>{t('totalGeneralExpenses')}</span>
                      <span className="text-blue-400 font-bold">
                        {formatEuro(vehicles.reduce((acc, v) => acc + (v.generalExpensesTotal || 0), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {mobileTab === 'sourceCode' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400">React Native (Expo)</span>
                    <button
                      onClick={handleCopyCode}
                      className="text-[10px] font-bold px-2 py-1 bg-amber-500 text-slate-950 rounded flex items-center gap-1"
                    >
                      {copiedCode ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCode ? t('copied') : t('copy')}</span>
                    </button>
                  </div>
                  <pre className="text-[9px] bg-slate-950 p-2 rounded-xl text-slate-300 font-mono overflow-x-auto max-h-[460px] border border-slate-800">
                    {reactNativeExpoCode}
                  </pre>
                </div>
              )}
            </div>

            {/* Mobile Bottom Navigation Bar (4 Native Tabs) */}
            <div className="px-2 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-around">
              <button
                onClick={() => setMobileTab('fleet')}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${
                  mobileTab === 'fleet' ? 'text-amber-400 font-bold' : 'text-slate-500'
                }`}
              >
                <Car className="w-4 h-4" />
                <span>{lang === 'ru' ? 'Автопарк' : 'Parc VO'}</span>
              </button>
              <button
                onClick={() => setMobileTab('mechanic')}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${
                  mobileTab === 'mechanic' ? 'text-amber-400 font-bold' : 'text-slate-500'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>{lang === 'ru' ? 'Сервис' : 'Atelier'}</span>
              </button>
              <button
                onClick={() => setMobileTab('pnl')}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${
                  mobileTab === 'pnl' ? 'text-amber-400 font-bold' : 'text-slate-500'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>{lang === 'ru' ? 'P&L Маржа' : 'Bilan P&L'}</span>
              </button>
              <button
                onClick={() => setMobileTab('sourceCode')}
                className={`flex flex-col items-center gap-0.5 text-[10px] ${
                  mobileTab === 'sourceCode' ? 'text-amber-400 font-bold' : 'text-slate-500'
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Code Expo</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
