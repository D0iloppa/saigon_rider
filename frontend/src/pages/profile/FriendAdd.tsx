import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { TopBar } from '@/components/layout/TopBar';
import { useUserStore } from '@/store/useUserStore';
import { searchUsers, followUser } from '@/api/follows';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { Button } from '@/components/ui/Button';
import { AppImage } from '@/components/ui/AppImage';
import { toast } from '@/components/ui/Toast';
import type { FollowUser } from '@/api/types';
import styles from './FriendAdd.module.css';

type Tab = 'search' | 'qr';
type QrSubTab = 'my' | 'scan';

export default function FriendAdd() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [qrSubTab, setQrSubTab] = useState<QrSubTab>('my');
  
  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FollowUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // QR state
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Search effect
  useEffect(() => {
    if (activeTab !== 'search' || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchUsers(query);
        setResults(res);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, activeTab]);

  // QR Scanner effect
  useEffect(() => {
    if (activeTab === 'qr' && qrSubTab === 'scan') {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [activeTab, qrSubTab]);

  const startScanner = async () => {
    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      setIsScanning(true);
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Assuming decodedText is the userId UUID
          await handleFollow(decodedText);
          stopScanner();
          setQrSubTab('my');
        },
        () => {} // silent error
      );
    } catch (err) {
      console.error("Scanner start failed", err);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleFollow = async (targetId: string) => {
    try {
      await followUser(targetId);
      toast.success(t('follow.followedSuccess'));
      // Mutual follow is check-as-friend, so just following is enough for now
    } catch (err: any) {
      toast.error(err.message || 'Error');
    }
  };

  if (!user) return null;

  return (
    <div className={styles.root}>
      <TopBar title={t('follow.addFriend')} />
      
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'search' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('search')}
        >
          {t('common.search')}
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'qr' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('qr')}
        >
          QR
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'search' && (
          <div className={styles.searchSection}>
            <div className={styles.searchBar}>
              <span className={styles.searchIcon}>🔍</span>
              <input 
                type="text" 
                placeholder={t('follow.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            
            <div className={styles.results}>
              {isSearching ? (
                <div className={styles.loading}>{t('common.loading')}</div>
              ) : results.length === 0 && query.length >= 2 ? (
                <div className={styles.empty}>{t('quest.emptyTitle')}</div>
              ) : (
                results.map((u) => (
                  <div key={u.id} className={styles.userRow}>
                    <AppImage src={u.avatarUrl || '/saigon-default.jpg'} alt="" className={styles.avatar} variant="circle" />
                    <div className={styles.userInfo}>
                      <span className={styles.nickname}>
                        {u.nickname} <LevelBadge level={u.level} />
                      </span>
                    </div>
                    {u.id !== user.id && (
                      <Button size="sm" onClick={() => handleFollow(u.id)}>
                        {t('follow.followBtn')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'qr' && (
          <div className={styles.qrSection}>
            <div className={styles.segmentWrap}>
              <button 
                className={`${styles.segTab} ${qrSubTab === 'my' ? styles.segTabActive : ''}`}
                onClick={() => setQrSubTab('my')}
              >
                {t('follow.myQr')}
              </button>
              <button 
                className={`${styles.segTab} ${qrSubTab === 'scan' ? styles.segTabActive : ''}`}
                onClick={() => setQrSubTab('scan')}
              >
                {t('follow.scanQr')}
              </button>
            </div>

            {qrSubTab === 'my' ? (
              <div className={styles.myQrBox}>
                <div className={styles.qrContainer}>
                  <QRCodeCanvas 
                    value={user.id} 
                    size={200} 
                    level="H"
                    includeMargin
                    imageSettings={{
                      src: user.avatarUrl || '/saigon-default.jpg',
                      x: undefined,
                      y: undefined,
                      height: 40,
                      width: 40,
                      excavate: true,
                    }}
                  />
                </div>
                <p className={styles.qrGuide}>{t('follow.myQrGuide')}</p>
                <div className={styles.myInfo}>
                  <span className={styles.myNickname}>{user.nickname}</span>
                  <span className={styles.myPhone}>{user.phone}</span>
                </div>
              </div>
            ) : (
              <div className={styles.scanBox}>
                <div id="reader" className={styles.reader}></div>
                {!isScanning && <div className={styles.scannerError}>Camera initialization failed</div>}
                <p className={styles.qrGuide}>{t('follow.scanGuide')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
