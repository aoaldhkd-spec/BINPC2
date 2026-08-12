import { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy, Component, ReactNode, memo } from 'react';
import {
  Heart, MessageCircle, Users, ChevronDown, CheckCircle,
  Eye, X, BookOpen,
  QrCode, Camera, Search, MoreHorizontal,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import type { Profile, ContactShare, Suggestion, Chat, MainTab, GroupChat, ProfileView, UserSignal } from '../types/app';
import { BIO_CATEGORIES } from '../lib/interests';
import { HeartType, HEART_TYPES, heartMeta } from '../lib/constants';
import { getPositionLabel, getPositionBg, getPositionStyle, getDomSubLabel, getDomSubBg, getKoreanAge, genAvatar } from '../lib/profile';
import { containsBannedNicknameWord } from '../lib/bannedWords';

// DiceBear URL 및 구형 data:image/svg (텍스트 initials 포함) → genAvatar 실루엣으로 강제 치환
const getAvatarSrc = (url: string | null | undefined, nick: string): string => {
  if (!url) return genAvatar(nick);
  // DiceBear URL (initials·thumbs 등 텍스트 노출 방지)
  if (url.includes('dicebear')) return genAvatar(nick);
  // 구형 data:image/svg+xml 아바타 (닉네임 텍스트가 인코딩된 채 저장된 것)
  if (url.startsWith('data:image/svg')) return genAvatar(nick);
  return url;
};
import { getZodiac, getOhaeng, getTodayFortune } from '../lib/fortune';
import { getMbtiStyle, koreanMatch } from '../lib/utils';
import { ls } from '../lib/storage';
import ProfileAvatar from './ProfileAvatar';
import { StatsTab, RankingTab } from './StatsTabs';
import { ProfileInfoBadges } from './ProfileInfoBadges';
import { TimerBanner } from './TimerBanner';
import { RefreshBtn } from './RefreshBtn';

// ── 기본 아바타 (내 상태 탭 사진 변경에서 사용) ────────────────────────────────
const _BASE = import.meta.env.BASE_URL ?? '/';
// DiceBear API로 캐릭터 아바타 생성 (style별 일러스트 자동 생성)
const _db = (style: string, seed: string, bg = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf') =>
  `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&size=100&backgroundColor=${bg}`;
// 이모지 + 배경색 SVG (음식 등 단순 표현용)
const _ea = (e: string, c: string) => {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><circle cx='50' cy='50' r='50' fill='${c}'/><text x='50' y='68' font-size='54' text-anchor='middle'>${e}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
};
const AVATAR_CATEGORIES = [
  // ── 인물 (애니/일러스트) ──────────────────────────────────────────────────
  { label: '✨ 인물', avatars: [
    { id:'av1',  src:`${_BASE}avatars/av1.webp`,  label:'핑크 요정' },
    { id:'av2',  src:`${_BASE}avatars/av2.webp`,  label:'민트 페어리' },
    { id:'av3',  src:`${_BASE}avatars/av3.webp`,  label:'퍼플 쿨가이' },
    { id:'av4',  src:`${_BASE}avatars/av4.webp`,  label:'코럴 큐티' },
    { id:'av5',  src:`${_BASE}avatars/av5.webp`,  label:'다크 시크' },
    { id:'av6',  src:`${_BASE}avatars/av6.webp`,  label:'레인보우' },
    { id:'av7',  src:`${_BASE}avatars/av7.webp`,  label:'베어 후디' },
    { id:'av8',  src:`${_BASE}avatars/av8.webp`,  label:'레트로 팜므' },
    { id:'av9',  src:`${_BASE}avatars/av9.webp`,  label:'스포티 짐' },
    { id:'av10', src:`${_BASE}avatars/av10.webp`, label:'북덕 지성파' },
    { id:'av19', src:`${_BASE}avatars/av19.webp`, label:'별빛 마법사' },
    { id:'av20', src:`${_BASE}avatars/av20.webp`, label:'닌자 소년' },
    { id:'av21', src:`${_BASE}avatars/av21.webp`, label:'실버 미남' },
    { id:'av22', src:`${_BASE}avatars/av22.webp`, label:'다크 귀족' },
    { id:'av23', src:`${_BASE}avatars/av23.webp`, label:'스포츠 에이스' },
    { id:'av24', src:`${_BASE}avatars/av24.webp`, label:'블루 스타' },
    { id:'av25', src:`${_BASE}avatars/av25.webp`, label:'도서관 지성' },
    { id:'av26', src:`${_BASE}avatars/av26.webp`, label:'다크 마법사' },
    { id:'av27', src:`${_BASE}avatars/av27.webp`, label:'불꽃 전사' },
    { id:'av28', src:`${_BASE}avatars/av28.webp`, label:'썬샤인 보이' },
    { id:'av29', src:`${_BASE}avatars/av29.webp`, label:'어쿠스틱 가이' },
    { id:'av30', src:`${_BASE}avatars/av30.webp`, label:'코지 스웨터' },
    { id:'av31', src:`${_BASE}avatars/av31.webp`, label:'배틀 파이터' },
    { id:'av32', src:`${_BASE}avatars/av32.webp`, label:'신비 엘프' },
    { id:'av33', src:`${_BASE}avatars/av33.webp`, label:'파스텔 레인보우' },
    { id:'av34', src:`${_BASE}avatars/av34.webp`, label:'냥코 큐티' },
    { id:'av35', src:`${_BASE}avatars/av35.webp`, label:'다크 앤젤' },
    { id:'av36', src:`${_BASE}avatars/av36.webp`, label:'오렌지 트윈테일' },
    { id:'av37', src:`${_BASE}avatars/av37.webp`, label:'사무라이' },
    { id:'av38', src:`${_BASE}avatars/av38.webp`, label:'숲의 요정' },
  ]},
  // ── 케이팝/현실 ────────────────────────────────────────────────────────────
  { label: '🎤 케이팝/현실', avatars: [
    { id:'av39', src:`${_BASE}avatars/av39.webp`, label:'케이팝 아이돌' },
    { id:'av40', src:`${_BASE}avatars/av40.webp`, label:'도심 보이' },
    { id:'av41', src:`${_BASE}avatars/av41.webp`, label:'서울 래퍼' },
    { id:'av42', src:`${_BASE}avatars/av42.webp`, label:'핑크 걸' },
    { id:'av43', src:`${_BASE}avatars/av43.webp`, label:'Y2K 버터플라이' },
    { id:'av44', src:`${_BASE}avatars/av44.webp`, label:'블랙 수트' },
    { id:'av45', src:`${_BASE}avatars/av45.webp`, label:'하늘 스마일' },
    { id:'av46', src:`${_BASE}avatars/av46.webp`, label:'보라 아이돌' },
    { id:'av47', src:`${_BASE}avatars/av47.webp`, label:'그래피티 가이' },
    { id:'av48', src:`${_BASE}avatars/av48.webp`, label:'벚꽃 러브' },
    { id:'av118',src:`${_BASE}avatars/av118.webp`,label:'걸그룹 댄서' },
    { id:'av119',src:`${_BASE}avatars/av119.webp`,label:'스트리트 패션' },
    { id:'av120',src:`${_BASE}avatars/av120.webp`,label:'시티팝 가수' },
    { id:'av121',src:`${_BASE}avatars/av121.webp`,label:'DJ 걸' },
    { id:'av122',src:`${_BASE}avatars/av122.webp`,label:'교복 K-pop' },
    { id:'av123',src:`${_BASE}avatars/av123.webp`,label:'스포티 보이' },
    { id:'av124',src:`${_BASE}avatars/av124.webp`,label:'발라드 가수' },
    { id:'av125',src:`${_BASE}avatars/av125.webp`,label:'빈티지 힙합' },
    { id:'av126',src:`${_BASE}avatars/av126.webp`,label:'보이그룹 비주얼' },
    { id:'av127',src:`${_BASE}avatars/av127.webp`,label:'솔로 아티스트' },
    { id:'av128',src:`${_BASE}avatars/av128.webp`,label:'재즈 뮤지션' },
    { id:'av129',src:`${_BASE}avatars/av129.webp`,label:'배틀 댄서' },
    { id:'av130',src:`${_BASE}avatars/av130.webp`,label:'K-드라마 히어로' },
    { id:'av131',src:`${_BASE}avatars/av131.webp`,label:'인디 기타리스트' },
    { id:'av132',src:`${_BASE}avatars/av132.webp`,label:'MV 여주' },
  ]},
  // ── 퀴어/프라이드 ──────────────────────────────────────────────────────────
  { label: '🏳️‍🌈 퀴어/프라이드', avatars: [
    { id:'av49', src:`${_BASE}avatars/av49.webp`, label:'레인보우 프라이드' },
    { id:'av50', src:`${_BASE}avatars/av50.webp`, label:'드래그 퀸' },
    { id:'av51', src:`${_BASE}avatars/av51.webp`, label:'젠더플루이드' },
    { id:'av52', src:`${_BASE}avatars/av52.webp`, label:'논바이너리' },
    { id:'av53', src:`${_BASE}avatars/av53.webp`, label:'트랜스 프라이드' },
    { id:'av54', src:`${_BASE}avatars/av54.webp`, label:'레즈비언 프라이드' },
    { id:'av55', src:`${_BASE}avatars/av55.webp`, label:'게이 프라이드' },
    { id:'av56', src:`${_BASE}avatars/av56.webp`, label:'퀴어 액티비스트' },
  ]},
  // ── 판타지/어드벤처 ────────────────────────────────────────────────────────
  { label: '⚔️ 판타지/어드벤처', avatars: [
    { id:'av57', src:`${_BASE}avatars/av57.webp`, label:'엘프 아처' },
    { id:'av58', src:`${_BASE}avatars/av58.webp`, label:'다크 워리어' },
    { id:'av59', src:`${_BASE}avatars/av59.webp`, label:'갤럭시 마법사' },
    { id:'av60', src:`${_BASE}avatars/av60.webp`, label:'사이버펑크' },
    { id:'av61', src:`${_BASE}avatars/av61.webp`, label:'뱀파이어 공작' },
    { id:'av62', src:`${_BASE}avatars/av62.webp`, label:'별빛 마녀' },
    { id:'av63', src:`${_BASE}avatars/av63.webp`, label:'우주 탐험가' },
    { id:'av64', src:`${_BASE}avatars/av64.webp`, label:'황금 전사' },
    { id:'av65', src:`${_BASE}avatars/av65.webp`, label:'빛의 천사' },
    { id:'av66', src:`${_BASE}avatars/av66.webp`, label:'미지의 모험가' },
    { id:'av67', src:`${_BASE}avatars/av67.webp`, label:'달빛 마법사' },
    { id:'av68', src:`${_BASE}avatars/av68.webp`, label:'드래곤 기사' },
    { id:'av69', src:`${_BASE}avatars/av69.webp`, label:'신비로운 자' },
    { id:'av70', src:`${_BASE}avatars/av70.webp`, label:'섀도우 닌자' },
    { id:'av71', src:`${_BASE}avatars/av71.webp`, label:'불꽃 기사' },
    { id:'av72', src:`${_BASE}avatars/av72.webp`, label:'얼음 마법사' },
    { id:'av73', src:`${_BASE}avatars/av73.webp`, label:'하늘 전사' },
    { id:'av74', src:`${_BASE}avatars/av74.webp`, label:'숲속 레인저' },
    { id:'av75', src:`${_BASE}avatars/av75.webp`, label:'인디 록' },
    { id:'av76', src:`${_BASE}avatars/av76.webp`, label:'어반 아티스트' },
    { id:'av77', src:`${_BASE}avatars/av77.webp`, label:'밤의 기사' },
    { id:'av78', src:`${_BASE}avatars/av78.webp`, label:'고독한 검사' },
    { id:'av79', src:`${_BASE}avatars/av79.webp`, label:'바람의 정령' },
    { id:'av80', src:`${_BASE}avatars/av80.webp`, label:'카페 바리스타' },
    { id:'av81', src:`${_BASE}avatars/av81.webp`, label:'도시 탐험가' },
    { id:'av82', src:`${_BASE}avatars/av82.webp`, label:'현대 전사' },
    { id:'av83', src:`${_BASE}avatars/av83.webp`, label:'낙원의 수호자' },
    { id:'av84', src:`${_BASE}avatars/av84.webp`, label:'미래 여전사' },
    { id:'av85', src:`${_BASE}avatars/av85.webp`, label:'세계 여행자' },
    { id:'av86', src:`${_BASE}avatars/av86.webp`, label:'야생 탐험가' },
    { id:'av87', src:`${_BASE}avatars/av87.webp`, label:'바다 모험가' },
    { id:'av88', src:`${_BASE}avatars/av88.webp`, label:'클래식 학자' },
    { id:'av89', src:`${_BASE}avatars/av89.webp`, label:'숲의 수호자' },
  ]},
  // ── 동물 ──────────────────────────────────────────────────────────────────
  { label: '🐾 동물', avatars: [
    { id:'av15', src:`${_BASE}avatars/av15.webp`, label:'시바 이누' },
    { id:'av16', src:`${_BASE}avatars/av16.webp`, label:'드리미 냥' },
    { id:'av17', src:`${_BASE}avatars/av17.webp`, label:'프라이드 펭귄' },
    { id:'av18', src:`${_BASE}avatars/av18.webp`, label:'선셋 여우' },
    { id:'av90', src:`${_BASE}avatars/av90.webp`, label:'판다' },
    { id:'av178',src:`${_BASE}avatars/av178.webp`,label:'하얀 토끼' },
    { id:'av179',src:`${_BASE}avatars/av179.webp`,label:'골든 리트리버' },
    { id:'av180',src:`${_BASE}avatars/av180.webp`,label:'페르시안 고양이' },
    { id:'av181',src:`${_BASE}avatars/av181.webp`,label:'햄스터' },
    { id:'av182',src:`${_BASE}avatars/av182.webp`,label:'다람쥐' },
    { id:'av183',src:`${_BASE}avatars/av183.webp`,label:'부엉이' },
    { id:'av184',src:`${_BASE}avatars/av184.webp`,label:'고슴도치' },
    { id:'av185',src:`${_BASE}avatars/av185.webp`,label:'아기 악어' },
    { id:'av186',src:`${_BASE}avatars/av186.webp`,label:'코알라' },
    { id:'av187',src:`${_BASE}avatars/av187.webp`,label:'미어캣' },
    { id:'av188',src:`${_BASE}avatars/av188.webp`,label:'너구리' },
    { id:'av189',src:`${_BASE}avatars/av189.webp`,label:'알파카' },
    { id:'av190',src:`${_BASE}avatars/av190.webp`,label:'개구리' },
    { id:'av191',src:`${_BASE}avatars/av191.webp`,label:'비글' },
    { id:'av192',src:`${_BASE}avatars/av192.webp`,label:'아기 공룡' },
    { id:'av220',src:`${_BASE}avatars/av220.webp`,label:'불곰' },
    { id:'av221',src:`${_BASE}avatars/av221.webp`,label:'호랑이' },
    { id:'av222',src:`${_BASE}avatars/av222.webp`,label:'사자' },
    { id:'av223',src:`${_BASE}avatars/av223.webp`,label:'기린' },
    { id:'av224',src:`${_BASE}avatars/av224.webp`,label:'코끼리' },
    { id:'av225',src:`${_BASE}avatars/av225.webp`,label:'얼룩말' },
    { id:'av226',src:`${_BASE}avatars/av226.webp`,label:'분홍 돼지' },
    { id:'av227',src:`${_BASE}avatars/av227.webp`,label:'양' },
    { id:'av228',src:`${_BASE}avatars/av228.webp`,label:'젖소' },
    { id:'av229',src:`${_BASE}avatars/av229.webp`,label:'말' },
    { id:'av230',src:`${_BASE}avatars/av230.webp`,label:'오리' },
    { id:'av231',src:`${_BASE}avatars/av231.webp`,label:'병아리' },
    { id:'av232',src:`${_BASE}avatars/av232.webp`,label:'앵무새' },
    { id:'av233',src:`${_BASE}avatars/av233.webp`,label:'플라밍고' },
    { id:'av234',src:`${_BASE}avatars/av234.webp`,label:'오리너구리' },
    { id:'av235',src:`${_BASE}avatars/av235.webp`,label:'아기 바다표범' },
    { id:'av236',src:`${_BASE}avatars/av236.webp`,label:'고래' },
    { id:'av237',src:`${_BASE}avatars/av237.webp`,label:'돌고래' },
    { id:'av238',src:`${_BASE}avatars/av238.webp`,label:'아기 상어' },
    { id:'av239',src:`${_BASE}avatars/av239.webp`,label:'바다거북' },
    { id:'av240',src:`${_BASE}avatars/av240.webp`,label:'오징어' },
    { id:'av241',src:`${_BASE}avatars/av241.webp`,label:'문어' },
    { id:'av242',src:`${_BASE}avatars/av242.webp`,label:'카피바라' },
    { id:'av243',src:`${_BASE}avatars/av243.webp`,label:'수달' },
    { id:'av244',src:`${_BASE}avatars/av244.webp`,label:'비버' },
    { id:'av245',src:`${_BASE}avatars/av245.webp`,label:'고릴라' },
    { id:'av246',src:`${_BASE}avatars/av246.webp`,label:'여우원숭이' },
    { id:'av247',src:`${_BASE}avatars/av247.webp`,label:'카멜레온' },
    { id:'av248',src:`${_BASE}avatars/av248.webp`,label:'낙타' },
    { id:'av249',src:`${_BASE}avatars/av249.webp`,label:'두더지' },
  ]},
  // ── 음식 (식사류) ──────────────────────────────────────────────────────────
  { label: '🍱 음식', avatars: [
    { id:'av11', src:`${_BASE}avatars/av11.webp`, label:'라멘' },
    { id:'av99', src:`${_BASE}avatars/av99.webp`, label:'라멘 군' },
    { id:'av101',src:`${_BASE}avatars/av101.webp`,label:'타코야키' },
    { id:'av193',src:`${_BASE}avatars/av193.webp`,label:'순두부찌개' },
    { id:'av194',src:`${_BASE}avatars/av194.webp`,label:'스시' },
    { id:'av195',src:`${_BASE}avatars/av195.webp`,label:'카레라이스' },
    { id:'av196',src:`${_BASE}avatars/av196.webp`,label:'피자' },
    { id:'av197',src:`${_BASE}avatars/av197.webp`,label:'햄버거' },
    { id:'av198',src:`${_BASE}avatars/av198.webp`,label:'마라탕' },
    { id:'av199',src:`${_BASE}avatars/av199.webp`,label:'아이스 아메리카노' },
    { id:'av200',src:`${_BASE}avatars/av200.webp`,label:'떡볶이' },
    { id:'av201',src:`${_BASE}avatars/av201.webp`,label:'삼겹살' },
    { id:'av202',src:`${_BASE}avatars/av202.webp`,label:'후라이드 치킨' },
    { id:'av203',src:`${_BASE}avatars/av203.webp`,label:'비빔밥' },
    { id:'av204',src:`${_BASE}avatars/av204.webp`,label:'파스타' },
    { id:'av205',src:`${_BASE}avatars/av205.webp`,label:'샌드위치' },
    { id:'av206',src:`${_BASE}avatars/av206.webp`,label:'핫도그' },
    { id:'av207',src:`${_BASE}avatars/av207.webp`,label:'쌀국수' },
    { id:'av250',src:`${_BASE}avatars/av250.webp`,label:'김밥' },
    { id:'av251',src:`${_BASE}avatars/av251.webp`,label:'된장찌개' },
    { id:'av252',src:`${_BASE}avatars/av252.webp`,label:'짜장면' },
    { id:'av253',src:`${_BASE}avatars/av253.webp`,label:'짬뽕' },
    { id:'av254',src:`${_BASE}avatars/av254.webp`,label:'닭갈비' },
    { id:'av255',src:`${_BASE}avatars/av255.webp`,label:'갈비탕' },
    { id:'av256',src:`${_BASE}avatars/av256.webp`,label:'칼국수' },
    { id:'av257',src:`${_BASE}avatars/av257.webp`,label:'오므라이스' },
    { id:'av258',src:`${_BASE}avatars/av258.webp`,label:'타코' },
    { id:'av259',src:`${_BASE}avatars/av259.webp`,label:'팟타이' },
    { id:'av260',src:`${_BASE}avatars/av260.webp`,label:'규동' },
    { id:'av261',src:`${_BASE}avatars/av261.webp`,label:'오코노미야키' },
    { id:'av262',src:`${_BASE}avatars/av262.webp`,label:'부대찌개' },
    { id:'av263',src:`${_BASE}avatars/av263.webp`,label:'잡채' },
    { id:'av264',src:`${_BASE}avatars/av264.webp`,label:'갈비찜' },
    { id:'av265',src:`${_BASE}avatars/av265.webp`,label:'새우 튀김' },
    { id:'av266',src:`${_BASE}avatars/av266.webp`,label:'연어 스테이크' },
    { id:'av267',src:`${_BASE}avatars/av267.webp`,label:'리조또' },
    { id:'av268',src:`${_BASE}avatars/av268.webp`,label:'포케볼' },
    { id:'av269',src:`${_BASE}avatars/av269.webp`,label:'팔라펠' },
    { id:'av270',src:`${_BASE}avatars/av270.webp`,label:'크루아상' },
    { id:'av271',src:`${_BASE}avatars/av271.webp`,label:'베이글' },
    { id:'av272',src:`${_BASE}avatars/av272.webp`,label:'클램차우더' },
    { id:'av273',src:`${_BASE}avatars/av273.webp`,label:'그릭 요거트' },
    { id:'av274',src:`${_BASE}avatars/av274.webp`,label:'콩나물국밥' },
    { id:'av275',src:`${_BASE}avatars/av275.webp`,label:'나시고랭' },
    { id:'av276',src:`${_BASE}avatars/av276.webp`,label:'월남쌈' },
    { id:'av277',src:`${_BASE}avatars/av277.webp`,label:'시저 샐러드' },
    { id:'av278',src:`${_BASE}avatars/av278.webp`,label:'뇨키' },
    { id:'av279',src:`${_BASE}avatars/av279.webp`,label:'새우 파스타' },
    { id:'av280',src:`${_BASE}avatars/av280.webp`,label:'연어 덮밥' },
    { id:'av281',src:`${_BASE}avatars/av281.webp`,label:'냉면' },
  ]},
  // ── 디저트 ────────────────────────────────────────────────────────────────
  { label: '🧁 디저트', avatars: [
    { id:'av12', src:`${_BASE}avatars/av12.webp`, label:'마카롱' },
    { id:'av14', src:`${_BASE}avatars/av14.webp`, label:'버블티' },
    { id:'av98', src:`${_BASE}avatars/av98.webp`, label:'딸기 케이크' },
    { id:'av100',src:`${_BASE}avatars/av100.webp`,label:'버블티 짱' },
    { id:'av102',src:`${_BASE}avatars/av102.webp`,label:'소금빵' },
    { id:'av103',src:`${_BASE}avatars/av103.webp`,label:'탕후루' },
    { id:'av104',src:`${_BASE}avatars/av104.webp`,label:'도넛' },
    { id:'av105',src:`${_BASE}avatars/av105.webp`,label:'에그타르트' },
    { id:'av208',src:`${_BASE}avatars/av208.webp`,label:'크레페' },
    { id:'av209',src:`${_BASE}avatars/av209.webp`,label:'아이스크림 콘' },
    { id:'av210',src:`${_BASE}avatars/av210.webp`,label:'쿠키' },
    { id:'av211',src:`${_BASE}avatars/av211.webp`,label:'초콜릿 케이크' },
    { id:'av212',src:`${_BASE}avatars/av212.webp`,label:'와플' },
    { id:'av213',src:`${_BASE}avatars/av213.webp`,label:'구미 베어' },
    { id:'av214',src:`${_BASE}avatars/av214.webp`,label:'대만 카스텔라' },
    { id:'av215',src:`${_BASE}avatars/av215.webp`,label:'붕어빵' },
    { id:'av216',src:`${_BASE}avatars/av216.webp`,label:'크로플' },
    { id:'av217',src:`${_BASE}avatars/av217.webp`,label:'마카롱 타워' },
    { id:'av218',src:`${_BASE}avatars/av218.webp`,label:'솜사탕' },
    { id:'av219',src:`${_BASE}avatars/av219.webp`,label:'화이트 초코 퐁듀' },
    { id:'av282',src:`${_BASE}avatars/av282.webp`,label:'과일 타르트' },
    { id:'av283',src:`${_BASE}avatars/av283.webp`,label:'티라미수' },
    { id:'av284',src:`${_BASE}avatars/av284.webp`,label:'치즈케이크' },
    { id:'av285',src:`${_BASE}avatars/av285.webp`,label:'밀레 크레페' },
    { id:'av286',src:`${_BASE}avatars/av286.webp`,label:'쇼트케이크' },
    { id:'av287',src:`${_BASE}avatars/av287.webp`,label:'타로 밀크티' },
    { id:'av288',src:`${_BASE}avatars/av288.webp`,label:'모나카' },
    { id:'av289',src:`${_BASE}avatars/av289.webp`,label:'팥빙수' },
    { id:'av290',src:`${_BASE}avatars/av290.webp`,label:'캐러멜 푸딩' },
    { id:'av291',src:`${_BASE}avatars/av291.webp`,label:'판나코타' },
    { id:'av292',src:`${_BASE}avatars/av292.webp`,label:'브라우니' },
    { id:'av293',src:`${_BASE}avatars/av293.webp`,label:'롤케이크' },
    { id:'av294',src:`${_BASE}avatars/av294.webp`,label:'에클레어' },
    { id:'av295',src:`${_BASE}avatars/av295.webp`,label:'프렌치 토스트' },
    { id:'av296',src:`${_BASE}avatars/av296.webp`,label:'슈크림' },
    { id:'av297',src:`${_BASE}avatars/av297.webp`,label:'딸기 파르페' },
    { id:'av298',src:`${_BASE}avatars/av298.webp`,label:'소프트 아이스크림' },
    { id:'av299',src:`${_BASE}avatars/av299.webp`,label:'초콜릿 트러플' },
    { id:'av300',src:`${_BASE}avatars/av300.webp`,label:'호두과자' },
    { id:'av301',src:`${_BASE}avatars/av301.webp`,label:'찹쌀떡' },
    { id:'av302',src:`${_BASE}avatars/av302.webp`,label:'약과' },
    { id:'av303',src:`${_BASE}avatars/av303.webp`,label:'식혜' },
    { id:'av304',src:`${_BASE}avatars/av304.webp`,label:'흑임자 라떼' },
    { id:'av305',src:`${_BASE}avatars/av305.webp`,label:'말차 케이크' },
    { id:'av306',src:`${_BASE}avatars/av306.webp`,label:'레인보우 케이크' },
    { id:'av307',src:`${_BASE}avatars/av307.webp`,label:'마들렌' },
    { id:'av308',src:`${_BASE}avatars/av308.webp`,label:'츄러스' },
    { id:'av309',src:`${_BASE}avatars/av309.webp`,label:'레몬 타르트' },
    { id:'av310',src:`${_BASE}avatars/av310.webp`,label:'다이후쿠 모찌' },
    { id:'av311',src:`${_BASE}avatars/av311.webp`,label:'까눌레' },
  ]},
  // ── 일상 소품 ──────────────────────────────────────────────────────────────
  { label: '📷 일상 소품', avatars: [
    { id:'av106',src:`${_BASE}avatars/av106.webp`,label:'카세트 테이프' },
    { id:'av107',src:`${_BASE}avatars/av107.webp`,label:'폴라로이드' },
    { id:'av108',src:`${_BASE}avatars/av108.webp`,label:'스마일 플라워' },
    { id:'av109',src:`${_BASE}avatars/av109.webp`,label:'헤드폰 텀블러' },
    { id:'av133',src:`${_BASE}avatars/av133.webp`,label:'스케이트보드' },
    { id:'av134',src:`${_BASE}avatars/av134.webp`,label:'테니스 라켓' },
    { id:'av135',src:`${_BASE}avatars/av135.webp`,label:'야구 글러브' },
    { id:'av136',src:`${_BASE}avatars/av136.webp`,label:'향수병' },
    { id:'av137',src:`${_BASE}avatars/av137.webp`,label:'책갈피' },
    { id:'av138',src:`${_BASE}avatars/av138.webp`,label:'핀 버튼 배지' },
    { id:'av139',src:`${_BASE}avatars/av139.webp`,label:'에코백' },
    { id:'av140',src:`${_BASE}avatars/av140.webp`,label:'양초' },
    { id:'av141',src:`${_BASE}avatars/av141.webp`,label:'스노우 글로브' },
    { id:'av142',src:`${_BASE}avatars/av142.webp`,label:'열기구' },
    { id:'av143',src:`${_BASE}avatars/av143.webp`,label:'레인부츠' },
    { id:'av144',src:`${_BASE}avatars/av144.webp`,label:'엽서' },
    { id:'av145',src:`${_BASE}avatars/av145.webp`,label:'선인장' },
    { id:'av146',src:`${_BASE}avatars/av146.webp`,label:'무지개 연' },
    { id:'av147',src:`${_BASE}avatars/av147.webp`,label:'개구리 우산' },
  ]},
  // ── 판타지/우주 ────────────────────────────────────────────────────────────
  { label: '🌙 판타지/우주', avatars: [
    { id:'av110',src:`${_BASE}avatars/av110.webp`,label:'마법 포션' },
    { id:'av111',src:`${_BASE}avatars/av111.webp`,label:'스마일 유령' },
    { id:'av112',src:`${_BASE}avatars/av112.webp`,label:'구름 위 별' },
    { id:'av113',src:`${_BASE}avatars/av113.webp`,label:'윙크 초승달' },
    { id:'av114',src:`${_BASE}avatars/av114.webp`,label:'몽글 우주인' },
    { id:'av148',src:`${_BASE}avatars/av148.webp`,label:'별똥별' },
    { id:'av149',src:`${_BASE}avatars/av149.webp`,label:'토성' },
    { id:'av150',src:`${_BASE}avatars/av150.webp`,label:'파스텔 아기 용' },
    { id:'av151',src:`${_BASE}avatars/av151.webp`,label:'수정 구슬' },
    { id:'av152',src:`${_BASE}avatars/av152.webp`,label:'요정 날개' },
    { id:'av153',src:`${_BASE}avatars/av153.webp`,label:'마법 지팡이' },
    { id:'av154',src:`${_BASE}avatars/av154.webp`,label:'마법의 책' },
    { id:'av155',src:`${_BASE}avatars/av155.webp`,label:'반딧불이' },
    { id:'av156',src:`${_BASE}avatars/av156.webp`,label:'마법 왕관' },
    { id:'av157',src:`${_BASE}avatars/av157.webp`,label:'무지개' },
    { id:'av158',src:`${_BASE}avatars/av158.webp`,label:'수호 정령' },
    { id:'av159',src:`${_BASE}avatars/av159.webp`,label:'새싹 요정' },
    { id:'av160',src:`${_BASE}avatars/av160.webp`,label:'마법 불꽃' },
    { id:'av161',src:`${_BASE}avatars/av161.webp`,label:'크리스탈' },
    { id:'av162',src:`${_BASE}avatars/av162.webp`,label:'별자리 지도' },
  ]},
  // ── 무기물 캐릭터 ──────────────────────────────────────────────────────────
  { label: '🖥️ 무기물', avatars: [
    { id:'av115',src:`${_BASE}avatars/av115.webp`,label:'레트로 컴퓨터' },
    { id:'av116',src:`${_BASE}avatars/av116.webp`,label:'픽셀 게임기' },
    { id:'av117',src:`${_BASE}avatars/av117.webp`,label:'빈티지 시계' },
    { id:'av163',src:`${_BASE}avatars/av163.webp`,label:'레코드 플레이어' },
    { id:'av164',src:`${_BASE}avatars/av164.webp`,label:'타자기' },
    { id:'av165',src:`${_BASE}avatars/av165.webp`,label:'그랜드 피아노' },
    { id:'av166',src:`${_BASE}avatars/av166.webp`,label:'바이올린' },
    { id:'av167',src:`${_BASE}avatars/av167.webp`,label:'어쿠스틱 기타' },
    { id:'av168',src:`${_BASE}avatars/av168.webp`,label:'빈티지 라디오' },
    { id:'av169',src:`${_BASE}avatars/av169.webp`,label:'구형 TV' },
    { id:'av170',src:`${_BASE}avatars/av170.webp`,label:'다이얼 전화기' },
    { id:'av171',src:`${_BASE}avatars/av171.webp`,label:'우편함' },
    { id:'av172',src:`${_BASE}avatars/av172.webp`,label:'책상 램프' },
    { id:'av173',src:`${_BASE}avatars/av173.webp`,label:'오르골' },
    { id:'av174',src:`${_BASE}avatars/av174.webp`,label:'우표' },
    { id:'av175',src:`${_BASE}avatars/av175.webp`,label:'노란 잠수함' },
    { id:'av176',src:`${_BASE}avatars/av176.webp`,label:'레트로 로봇' },
    { id:'av177',src:`${_BASE}avatars/av177.webp`,label:'필름 카메라' },
  ]},
  // ── 과일 ──────────────────────────────────────────────────────────────────
  { label: '🍓 과일', avatars: [
    { id:'av13', src:`${_BASE}avatars/av13.webp`, label:'아보카도' },
    { id:'av312',src:`${_BASE}avatars/av312.webp`,label:'딸기' },
    { id:'av313',src:`${_BASE}avatars/av313.webp`,label:'사과' },
    { id:'av314',src:`${_BASE}avatars/av314.webp`,label:'바나나' },
    { id:'av315',src:`${_BASE}avatars/av315.webp`,label:'포도' },
    { id:'av316',src:`${_BASE}avatars/av316.webp`,label:'오렌지' },
    { id:'av317',src:`${_BASE}avatars/av317.webp`,label:'수박' },
    { id:'av318',src:`${_BASE}avatars/av318.webp`,label:'복숭아' },
    { id:'av319',src:`${_BASE}avatars/av319.webp`,label:'망고' },
    { id:'av320',src:`${_BASE}avatars/av320.webp`,label:'파인애플' },
    { id:'av321',src:`${_BASE}avatars/av321.webp`,label:'체리' },
    { id:'av322',src:`${_BASE}avatars/av322.webp`,label:'블루베리' },
    { id:'av323',src:`${_BASE}avatars/av323.webp`,label:'레몬' },
    { id:'av324',src:`${_BASE}avatars/av324.webp`,label:'라임' },
    { id:'av325',src:`${_BASE}avatars/av325.webp`,label:'키위' },
    { id:'av326',src:`${_BASE}avatars/av326.webp`,label:'파파야' },
    { id:'av327',src:`${_BASE}avatars/av327.webp`,label:'용과' },
    { id:'av328',src:`${_BASE}avatars/av328.webp`,label:'리치' },
    { id:'av329',src:`${_BASE}avatars/av329.webp`,label:'패션후르츠' },
    { id:'av330',src:`${_BASE}avatars/av330.webp`,label:'구아바' },
    { id:'av331',src:`${_BASE}avatars/av331.webp`,label:'귤' },
    { id:'av332',src:`${_BASE}avatars/av332.webp`,label:'자몽' },
    { id:'av333',src:`${_BASE}avatars/av333.webp`,label:'배' },
    { id:'av334',src:`${_BASE}avatars/av334.webp`,label:'멜론' },
    { id:'av335',src:`${_BASE}avatars/av335.webp`,label:'자두' },
    { id:'av336',src:`${_BASE}avatars/av336.webp`,label:'살구' },
    { id:'av337',src:`${_BASE}avatars/av337.webp`,label:'유자' },
    { id:'av338',src:`${_BASE}avatars/av338.webp`,label:'석류' },
    { id:'av339',src:`${_BASE}avatars/av339.webp`,label:'무화과' },
    { id:'av340',src:`${_BASE}avatars/av340.webp`,label:'감' },
    { id:'av341',src:`${_BASE}avatars/av341.webp`,label:'대추' },
    { id:'av342',src:`${_BASE}avatars/av342.webp`,label:'금귤' },
    { id:'av343',src:`${_BASE}avatars/av343.webp`,label:'천도복숭아' },
    { id:'av344',src:`${_BASE}avatars/av344.webp`,label:'산딸기' },
    { id:'av345',src:`${_BASE}avatars/av345.webp`,label:'블랙베리' },
    { id:'av346',src:`${_BASE}avatars/av346.webp`,label:'크랜베리' },
    { id:'av347',src:`${_BASE}avatars/av347.webp`,label:'오디' },
    { id:'av348',src:`${_BASE}avatars/av348.webp`,label:'두리안' },
    { id:'av349',src:`${_BASE}avatars/av349.webp`,label:'람부탄' },
    { id:'av350',src:`${_BASE}avatars/av350.webp`,label:'스타프루트' },
    { id:'av351',src:`${_BASE}avatars/av351.webp`,label:'코코넛' },
    { id:'av352',src:`${_BASE}avatars/av352.webp`,label:'포멜로' },
    { id:'av353',src:`${_BASE}avatars/av353.webp`,label:'아사이베리' },
    { id:'av354',src:`${_BASE}avatars/av354.webp`,label:'참외' },
    { id:'av355',src:`${_BASE}avatars/av355.webp`,label:'매실' },
    { id:'av356',src:`${_BASE}avatars/av356.webp`,label:'앵두' },
    { id:'av357',src:`${_BASE}avatars/av357.webp`,label:'청사과' },
    { id:'av358',src:`${_BASE}avatars/av358.webp`,label:'흰 딸기' },
    { id:'av359',src:`${_BASE}avatars/av359.webp`,label:'청포도' },
    { id:'av360',src:`${_BASE}avatars/av360.webp`,label:'클레멘타인' },
  ]},
];
import { ResetButton } from './ResetButton';
const FortuneTab = lazy(() => import('./FortuneTab'));

// ─── StatusErrorBoundary ──────────────────────────────────────────────────────

class StatusErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[StatusErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <p className="text-red-500 font-bold text-sm">내 상태 탭 오류가 발생했습니다.</p>
          <p className="text-gray-400 text-xs">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-cyan-500 text-white text-xs font-bold rounded-xl"
          >다시 시도</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── ProfileCard (memoized — 하트/채팅 상태 변경 시 해당 카드만 재렌더) ────────

export const ProfileCard = memo(function ProfileCard({
  profile, isLiked, sentHeartType, heartCount, canLike, locked, onLike, onSelect, onOpenChat, onBlock, onContactShare, onViewFortune, idealMsg, statusMsg,
}: {
  profile: Profile;
  isLiked: boolean;
  sentHeartType: HeartType | undefined;
  heartCount: number;
  canLike: boolean;
  locked?: boolean;
  onLike: (id: string) => void;
  onSelect: (p: Profile) => void;
  onOpenChat: (p: Profile) => void;
  onBlock?: (id: string, type: 'block' | 'hide') => void;
  onContactShare?: (p: Profile) => void;
  onViewFortune?: (p: Profile) => void;
  idealMsg?: string | null;
  statusMsg?: string | null;
}) {
  const { theme } = useTheme();
  // dark-neon / default → 카드 배경이 어두움; y2k / minimal → 흰 배경
  const isCardDark = theme === 'dark-neon' || theme === 'default';

  const posLabel = getPositionLabel(profile.personality_score ?? 50);
  const posStyle = getPositionStyle(profile.personality_score ?? 50);
  // bio(편집 후) 또는 interests(초기 설정) 중 값이 있는 쪽 사용
  const rawBio = profile.bio || (Array.isArray(profile.interests)
    ? (profile.interests as string[]).join(', ')
    : profile.interests ? String(profile.interests) : '');
  const bioTags = rawBio ? rawBio.split(',').map((t: string) => t.trim()).filter(Boolean).slice(0, 2) : [];
  const age = getKoreanAge(profile.birth_year);
  const msStyle = profile.mbti ? getMbtiStyle(profile.mbti) : null;
  // 테마 적응형 스타일 (Tailwind 오버라이드 없이 항상 올바른 색상 보장)
  // 카드 배경이 항상 bg-white이므로 태그는 배경·테두리 없이 텍스트만
  const tagStyle = { backgroundColor: 'transparent', color: '#6b7280', borderColor: 'transparent' };
  const heartBtnStyle = isCardDark
    ? { backgroundColor: 'rgba(251,113,133,0.13)', borderColor: 'rgba(251,113,133,0.28)' }
    : { backgroundColor: '#fff1f2', borderColor: '#fecdd3' };
  const chatBtnStyle = isCardDark
    ? { backgroundColor: 'rgba(56,189,248,0.13)', borderColor: 'rgba(56,189,248,0.28)' }
    : { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' };
  const dividerColor = isCardDark ? 'rgba(255,255,255,0.09)' : '#f3f4f6';

  // 잠금 토스트 (컴포넌트 최상단 — Rules of Hooks 준수)
  const [lockToast, setLockToast] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{top:number;right:number}|null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const showLockToast = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLockToast(true);
    setTimeout(() => setLockToast(false), 1400);
  };

  // 이미지 naturalRatio를 추적해 플립 존(실제 사진 영역)을 계산
  // objectFit:contain 상태에서 빈공간은 그대로 두고 사진 영역만 뒤집기 위해 사용
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w && h) setNaturalRatio(w / h);
  };

  // 상태 메시지 자동 마키 — 텍스트가 바 너비를 초과하면 슬라이드 애니메이션 적용
  const tickerBarRef = useRef<HTMLDivElement>(null);
  const tickerSpanRef = useRef<HTMLSpanElement>(null);
  const [tickerOffset, setTickerOffset] = useState(0); // 슬라이드할 px 거리
  useEffect(() => {
    const bar = tickerBarRef.current;
    const span = tickerSpanRef.current;
    if (!bar || !span) { setTickerOffset(0); return; }
    // ResizeObserver로 카드 크기 변동 시에도 재계산
    const calc = () => {
      const overflow = span.scrollWidth - bar.clientWidth;
      setTickerOffset(overflow > 4 ? overflow + 12 : 0);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [statusMsg]);

  // 컨테이너 비율 3:4 = 0.75
  // 이미지 비율이 0.75보다 크면(정사각형·가로형) → 너비로 제한, 위아래 빈공간
  // 이미지 비율이 0.75보다 작으면(세로형)       → 높이로 제한, 좌우 빈공간
  const CRATIO = 3 / 4;
  const r = naturalRatio ?? CRATIO;
  const flipZoneStyle: React.CSSProperties = r >= CRATIO
    ? {
        // 위아래 여백: 사진이 너비 꽉 참, 높이는 0.75/r 비율
        position: 'absolute', left: 0, right: 0,
        top:    `${((1 - CRATIO / r) / 2) * 100}%`,
        height: `${(CRATIO / r) * 100}%`,
      }
    : {
        // 좌우 여백: 사진이 높이 꽉 참, 너비는 r/0.75 비율
        position: 'absolute', top: 0, bottom: 0,
        left:  `${((1 - r / CRATIO) / 2) * 100}%`,
        width: `${(r / CRATIO) * 100}%`,
      };

  // [Fix-9] ⋯ 메뉴 외부 클릭 시 닫기 — fixed 위치이므로 부모 overflow:hidden 영향 없음
  useEffect(() => {
    if (!showMenu) return;
    const close = () => { setShowMenu(false); setMenuPos(null); };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [showMenu]);

  return (
    <div className="group relative bg-white rounded-2xl shadow-sm border border-gray-100">

      {/* ··· 메뉴 — 카드 최상단에 배치, overflow:hidden 밖이라 클릭 완전 보장 */}
      {(onBlock || onContactShare || onViewFortune) && (
        <div className="absolute top-1 right-1 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (showMenu) { setShowMenu(false); setMenuPos(null); return; }
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
              setShowMenu(true);
            }}
            className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center active:scale-90 transition-transform"
            aria-label="더보기"
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-white" />
          </button>
          {showMenu && menuPos && (
            <div
              style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999, minWidth: '192px' }}
              className={`rounded-2xl shadow-2xl border overflow-hidden ${isCardDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {onContactShare && (
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onContactShare(profile); }}
                  className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 ${isCardDark ? 'text-teal-400 hover:bg-slate-700' : 'text-teal-600 hover:bg-teal-50'}`}>💌 연락처 보내기</button>
              )}
              {onViewFortune && (
                <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onViewFortune(profile); }}
                  className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 border-t ${isCardDark ? 'text-violet-400 hover:bg-slate-700 border-slate-700' : 'text-violet-600 hover:bg-violet-50 border-gray-50'}`}>🔮 사주 보기</button>
              )}
              {onBlock && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onBlock(profile.id, 'block'); }}
                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 border-t ${isCardDark ? 'text-red-400 hover:bg-slate-700 border-slate-700' : 'text-red-500 hover:bg-red-50 border-gray-50'}`}>🚫 차단하기</button>
                  <button onClick={(e) => { e.stopPropagation(); setShowMenu(false); setMenuPos(null); onBlock(profile.id, 'hide'); }}
                    className={`w-full text-left px-4 py-3 text-xs font-bold flex items-center gap-2 border-t ${isCardDark ? 'text-slate-300 hover:bg-slate-700 border-slate-700' : 'text-gray-600 hover:bg-gray-50 border-gray-50'}`}>👻 나를 못 보게 하기</button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 사진 영역 wrapper (이름/나이 overlay 고정용) ──────────────────────── */}
      <div style={{ position: 'relative' }}>

        {/* ── 3:4 외부 컨테이너 — 플립 없음, 빈공간(배경색)만 표시 ── */}
        <div
          style={{
            aspectRatio: '3/4', position: 'relative',
            backgroundColor: '#f3f4f6',
            borderRadius: '12px 12px 0 0',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
          onClick={(e) => { e.stopPropagation(); setIsFlipped(f => !f); }}
        >
          {/* 상태 메시지 — 외부 컨테이너 상단, 플립과 무관하게 항상 표시 */}
          {statusMsg?.trim() && (
            <div
              ref={tickerBarRef}
              className="absolute top-0 left-0 right-0 z-10"
              style={{
                height: '22px',
                background: 'rgba(0,0,0,0.52)',
                backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center',
                paddingLeft: '6px', paddingRight: '6px',
                animation: 'ticker-fadein 0.3s ease',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                ref={tickerSpanRef}
                style={{
                  fontSize: '11px', fontWeight: 500,
                  color: 'rgba(255,255,255,0.92)', letterSpacing: '0.02em',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                  flexShrink: 0,
                  ...(tickerOffset > 0
                    ? {
                        // 텍스트가 넘침 → 슬라이드 마키 모드
                        ['--ticker-offset' as string]: `-${tickerOffset}px`,
                        animation: `ticker-scroll ${Math.max(4, Math.round(tickerOffset / 30) + 3)}s ease-in-out infinite`,
                      }
                    : {
                        // 텍스트가 여유 있음 → 중앙 정렬 + 깜빡임
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: '100%',
                        animation: 'ticker-flash 2.2s ease-in-out infinite',
                      }
                  ),
                }}
              >{statusMsg}</span>
            </div>
          )}

          {/* ── 플립 존 — 실제 사진이 렌더되는 영역에만 3D 뒤집기 적용 ── */}
          <div style={{ perspective: '1000px', ...flipZoneStyle }}>
            <div style={{
              width: '100%', height: '100%',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.55s cubic-bezier(.4,0,.2,1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'none',
            }}>

              {/* 앞면: 사진 */}
              <div style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                overflow: 'hidden',
              }}>
                <img
                  src={getAvatarSrc(profile.photo_url, profile.nickname)}
                  alt={profile.nickname}
                  loading="lazy"
                  decoding="async"
                  onLoad={handleImgLoad}
                  onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(profile.nickname); }}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              {/* 뒷면: 이상형 */}
              <div style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                background: 'linear-gradient(160deg,#1c0a2e 0%,#3b1152 40%,#5b1a6e 70%,#2a0a40 100%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '14px 10px', gap: '8px', overflow: 'hidden',
              }}>
                <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                  background:'radial-gradient(ellipse at 50% 0%,rgba(255,100,200,0.28) 0%,transparent 60%)' }} />
                <div style={{ position:'absolute', inset:0, pointerEvents:'none',
                  background:'radial-gradient(ellipse at 50% 100%,rgba(140,60,255,0.22) 0%,transparent 55%)' }} />
                <span style={{position:'absolute',top:'8%',left:'10%',fontSize:'11px',opacity:0.5}}>✦</span>
                <span style={{position:'absolute',top:'6%',right:'12%',fontSize:'9px',opacity:0.4}}>✦</span>
                <span style={{position:'absolute',bottom:'14%',left:'8%',fontSize:'9px',opacity:0.35}}>✦</span>
                <span style={{position:'absolute',bottom:'9%',right:'10%',fontSize:'11px',opacity:0.45}}>✦</span>
                <div style={{fontSize:'36px',lineHeight:1,position:'relative',zIndex:1,
                  filter:'drop-shadow(0 0 12px rgba(255,80,160,0.9))'}}>💗</div>
                <p style={{color:'#ffd6f0',fontSize:'10px',fontWeight:900,
                  letterSpacing:'0.2em',textTransform:'uppercase',margin:0,position:'relative',zIndex:1}}>
                  나의 이상형
                </p>
                <div style={{width:'40px',height:'1px',background:'rgba(255,180,230,0.4)',margin:'-2px 0'}} />
                {(() => {
                  const parts = (idealMsg ?? '').split('\n');
                  const tags = parts[0] ? parts[0].split(',').map(t=>t.trim()).filter(Boolean) : [];
                  const free = parts[1] ?? '';
                  if (!tags.length && !free) return (
                    <p style={{color:'rgba(255,210,240,0.45)',fontSize:'11px',
                      textAlign:'center',margin:'2px 0 4px',lineHeight:1.6,position:'relative',zIndex:1}}>
                      아직 작성하지<br/>않았어요 🌸
                    </p>
                  );
                  return (
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',width:'100%',position:'relative',zIndex:1}}>
                      {tags.length > 0 && (
                        <div style={{display:'flex',flexWrap:'wrap',gap:'4px',justifyContent:'center'}}>
                          {tags.map(t=>(
                            <span key={t} style={{
                              padding:'3px 9px',borderRadius:'20px',
                              background:'rgba(255,180,230,0.18)',
                              border:'1px solid rgba(255,160,220,0.45)',
                              color:'#ffeaf6',fontSize:'11px',fontWeight:700,
                            }}>{t}</span>
                          ))}
                        </div>
                      )}
                      {free && (
                        <p style={{color:'rgba(255,230,245,0.85)',fontSize:'11px',
                          textAlign:'center',lineHeight:1.6,margin:0,fontStyle:'italic'}}>
                          "{free}"
                        </p>
                      )}
                    </div>
                  );
                })()}
                <button
                  onClick={(e)=>{e.stopPropagation();onSelect(profile);}}
                  style={{
                    marginTop:'2px',
                    background:'rgba(255,180,230,0.2)',border:'1px solid rgba(255,160,220,0.5)',
                    color:'#ffd6f0',fontSize:'11px',fontWeight:700,
                    padding:'5px 14px',borderRadius:'20px',cursor:'pointer',
                  }}
                >프로필 보기 →</button>
              </div>

            </div>
          </div>{/* /플립 존 */}
        </div>{/* /3:4 외부 컨테이너 */}

        {/* ── 이름+나이 overlay — 플립·이미지 크기와 무관, 항상 사진 영역 하단 고정 ── */}
        <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pointer-events-none" style={{ zIndex: 5 }}>
          <div className="inline-flex items-baseline gap-1.5 rounded-lg px-2 py-0.5 max-w-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)' }}>
            <span className="font-black text-[13px] leading-tight truncate" style={{ color: '#fff' }}>{profile.nickname}</span>
            {profile.birth_year && (
              <span className="text-[10px] font-semibold flex-shrink-0" style={{ color: 'rgba(255,255,255,0.82)' }}>{age}</span>
            )}
          </div>
        </div>

      </div>{/* /사진 영역 wrapper */}

      {/* ── 성향 + MBTI (항상 표시, 플립 안 됨) ────────────────────────────────── */}
      <div className="px-2.5 pt-2 pb-1 flex items-center justify-between gap-1 cursor-pointer"
        onClick={() => onSelect(profile)}>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg leading-tight border"
          style={{ backgroundColor: posStyle.bg, color: posStyle.text, borderColor: posStyle.border }}>
          {posLabel}
        </span>
        {msStyle && (
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-lg leading-tight border"
            style={{ backgroundColor: msStyle.bg + 'dd', color: msStyle.color, borderColor: msStyle.border }}>
            {profile.mbti}
          </span>
        )}
      </div>

      {/* ── 관심사 (최대 2개, 항상 표시) ───────────────────────────────────────── */}
      {bioTags.length > 0 && (
        <div className="px-2.5 pb-1.5 flex gap-1 overflow-hidden cursor-pointer" onClick={() => onSelect(profile)}>
          {bioTags.slice(0, 2).map(tag => (
            <span key={tag} className="text-[11px] font-semibold whitespace-nowrap flex-shrink-0" style={tagStyle}>#{tag}</span>
          ))}
        </div>
      )}

      {/* ── 하트 + 채팅 버튼 — 항상 표시, 절대 플립 안 됨, z-index 보장 ────────── */}
      {canLike && (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          {lockToast && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800/90 text-white shadow pointer-events-none">
              🔒 현재 잠금 중
            </div>
          )}
          <div className="px-2 pb-2 pt-0.5 flex gap-1.5 mt-1" style={{ borderTop: `1px solid ${dividerColor}` }}>
            <button
              onClick={(e) => { if (locked) { showLockToast(e); return; } e.stopPropagation(); onLike(profile.id); }}
              disabled={!locked && isLiked && heartCount >= 4}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border active:scale-95 transition-transform ${locked ? 'opacity-50' : ''}`}
              style={heartBtnStyle}
            >
              {isLiked && sentHeartType
                ? <span className="text-xs leading-none relative">
                    {heartMeta(sentHeartType).emoji}
                    {heartCount > 1 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 text-white text-[7px] font-black rounded-full flex items-center justify-center">{heartCount}</span>
                    )}
                  </span>
                : <Heart className="w-3.5 h-3.5" style={{ fill: isLiked ? '#e11d48' : 'transparent', stroke: '#e11d48', strokeWidth: 2 }} />
              }
              <span className="text-[10px] font-bold" style={{ color: '#e11d48' }}>하트</span>
            </button>
            <button
              onClick={(e) => { if (locked) { showLockToast(e); return; } e.stopPropagation(); onOpenChat(profile); }}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border active:scale-95 transition-transform ${locked ? 'opacity-50' : ''}`}
              style={chatBtnStyle}
            >
              <MessageCircle className="w-3.5 h-3.5" style={{ color: '#0ea5e9' }} strokeWidth={2} />
              <span className="text-[10px] font-bold" style={{ color: '#0ea5e9' }}>채팅</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── MainScreen ───────────────────────────────────────────────────────────────

// ── 이상형 태그 그룹 ─────────────────────────────────────────────────────────
const IDEAL_TAG_GROUPS = [
  { label: '얼굴상 👀', tags: ['감자상', '댕댕이상', '고양이상', '곰상', '여우상', '공룡상', '토끼상', '눈웃음'] },
  { label: '체형 💪', tags: ['키큰', '슬림', '근육있는', '통통귀여운', '보통체형'] },
  { label: '매력 ✨', tags: ['섹끼있는', '다정한', '귀여운', '반전매력', '차분한', '웃음많은', '텐션높은', '술잘마시는'] },
] as const;

export function MainScreen({
  profiles, currentUserId, likedIds, sentHeartTypes, sentHeartsPerPerson, likeStatuses, profileMap, mainTab,
  onTabChange, onLike, onSelect, onReset, onProfileClickFromMap: _onProfileClickFromMap,
  receivedLikers, receivedHeartTypes, sentLikedProfiles, contactSharedWithIds, acknowledgedComplimentIds,
  receivedContactShares, pendingHeartsCount, chatList, suggestions,
  onContactShareOpen: _onContactShareOpen, onContactViewOpen, onHeartResponse, onDeleteChat, onDeleteAllChats, onSubmitSuggestion, onOpenChat,
  onSubmitAnonymousReport,
  timerEndAt, timerLabel, onRefreshStatus, onRefreshChat, onRefreshProfiles, darkMode, onToggleDark, onShowQr, onShowContactQr, onScanQr, scannedContacts, onClearScannedContact, functionsLocked = false, onShowTutorial,
  newMsgCount, onClearMsgCount, unreadChatCounts, onClearChatUnread: _onClearChatUnread, resetPassword,
  onUpdateProfile, fortuneCompatTarget, myHeartCount, heartDrainEnabled,
  groupChats = [], unreadGroupCounts = {}, newGroupMsgCount: _newGroupMsgCount = 0, onClearGroupMsgCount: _onClearGroupMsgCount, onOpenGroupChat,
  blockedUserIds = new Set<string>(), hiddenByIds = new Set<string>(),
  profileVisitors = [] as ProfileView[],
  onBlock,
  myBlockList = [] as import('../types/app').BlockedUser[],
  onUnblock,
  onViewFortune,
  userSignals = [] as UserSignal[],
}: {
  profiles: Profile[]; currentUserId: string | null; likedIds: Set<string>; sentHeartTypes: Map<string, HeartType>; sentHeartsPerPerson: Map<string, Set<HeartType>>; likeStatuses: Map<string, string>;
  profileMap: Map<string, Profile>; mainTab: MainTab;
  onTabChange: (t: MainTab) => void; onLike: (id: string) => void;
  onSelect: (p: Profile) => void; onReset: () => void;
  onProfileClickFromMap: (profile: Profile) => void;
  receivedLikers: Profile[]; receivedHeartTypes: Map<string, HeartType>; sentLikedProfiles: Profile[];
  contactSharedWithIds: Set<string>; acknowledgedComplimentIds: Set<string>; receivedContactShares: ContactShare[];
  pendingHeartsCount: number; chatList: Chat[]; suggestions: Suggestion[];
  onContactShareOpen: (profile: Profile) => void;
  onContactViewOpen: (share: ContactShare, profile: Profile) => void;
  onHeartResponse: (likerId: string, response: 'accepted' | 'rejected') => void;
  onDeleteChat: (chat: Chat) => void;
  onDeleteAllChats: () => void;
  onSubmitSuggestion: (content: string, contactInfo: string) => Promise<void>;
  onOpenChat: (profile: Profile) => void;
  onSubmitAnonymousReport: (content: string, tableNumber: number | null) => Promise<void>;
  timerEndAt: string | null;
  timerLabel: string | null;
  onRefreshStatus: () => void;
  onRefreshChat: () => void;
  onRefreshProfiles: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
  onShowQr: () => void;
  onShowContactQr: () => void;
  onScanQr: () => void;
  scannedContacts: Array<{ id: string; nickname: string; mbti?: string | null; photo_url?: string | null; kakao_id?: string | null; instagram_id?: string | null; phone_number?: string | null; contact_private?: boolean | null; scanned_at: string }>;
  onClearScannedContact: (id: string) => void;
  functionsLocked?: boolean;
  onShowTutorial: () => void;
  newMsgCount: number;
  onClearMsgCount: () => void;
  unreadChatCounts: Record<string, number>;
  onClearChatUnread: (chatId: string) => void;
  resetPassword: string | null;
  onUpdateProfile: (update: Record<string, unknown> & { id: string }) => void;
  fortuneCompatTarget?: string;
  myHeartCount?: number | null;
  heartDrainEnabled?: boolean;
  groupChats?: GroupChat[];
  unreadGroupCounts?: Record<string, number>;
  newGroupMsgCount?: number;
  onClearGroupMsgCount?: () => void;
  onOpenGroupChat?: (groupId: string) => void;
  blockedUserIds?: Set<string>;
  hiddenByIds?: Set<string>;
  profileVisitors?: ProfileView[];
  onBlock?: (targetId: string, type: 'block' | 'hide') => void;
  myBlockList?: import('../types/app').BlockedUser[];
  onUnblock?: (blockId: string) => void;
  onViewFortune?: (p: Profile) => void;
  userSignals?: UserSignal[];
}) {
  const heartCount = useCallback((t: HeartType) => { let c = 0; sentHeartsPerPerson.forEach(types => { if (types.has(t)) c++; }); return c; }, [sentHeartsPerPerson]);
  const tableNumber: number | null = null;

  const _currentUserNickname = useMemo(() => profiles.find(p => p.id === currentUserId)?.nickname ?? '', [profiles, currentUserId]);
  const [profileSearch, setProfileSearch] = useState('');
  const [profilePersonalityFilter, setProfilePersonalityFilter] = useState<string | null>(null);
  const [showBlockList, setShowBlockList] = useState(false);
  const [showVisitors, setShowVisitors] = useState(false);
  const [profileMbtiFilter, setProfileMbtiFilter] = useState<string | null>(null);
  // 채팅 탭 내 서브탭: 1:1 채팅 / 단체 채팅
  const [chatSubTab, setChatSubTab] = useState<'direct' | 'group'>('direct');

  // ── 상태·이상형 입력 상태 ──────────────────────────────────────────────────────
  const [signalCardOpen, setSignalCardOpen] = useState(true);
  const [signalStatusMsg, setSignalStatusMsg] = useState('');
  const [idealTags, setIdealTags] = useState<string[]>([]);
  const [idealFreeText, setIdealFreeText] = useState('');
  const [signalSaving, setSignalSaving] = useState(false);
  // 내 user_signals 초기값 동기화
  // ideal_msg 형식: "태그1,태그2\n기타자유텍스트" (줄바꿈으로 구분)
  useEffect(() => {
    const my = userSignals.find(s => s.user_id === currentUserId);
    if (my) {
      setSignalStatusMsg(my.status_msg ?? '');
      const parts = (my.ideal_msg ?? '').split('\n');
      setIdealTags(parts[0] ? parts[0].split(',').map(t => t.trim()).filter(Boolean) : []);
      setIdealFreeText(parts[1] ?? '');
    }
  }, [userSignals, currentUserId]);

  // 참여자 목록 — 필터·정렬을 매 렌더마다 재계산하지 않도록 메모이제이션
  const filteredProfiles = useMemo(() => {
    return [...profiles]
      .filter(p => {
        // 차단·숨기기 필터 (상호 차단 or 상대방이 나를 숨긴 경우 제외)
        if (blockedUserIds.has(p.id) || hiddenByIds.has(p.id)) return false;
        if (profileSearch) {
          const matchNick = koreanMatch(p.nickname, profileSearch);
          const matchMbti = !!p.mbti && koreanMatch(p.mbti, profileSearch);
          const matchPos = koreanMatch(getPositionLabel(p.personality_score ?? 50), profileSearch);
          if (!matchNick && !matchMbti && !matchPos) return false;
        }
        if (profilePersonalityFilter) {
          const score = p.personality_score ?? 50;
          if (profilePersonalityFilter === '비선호' && score >= 0) return false;
          if (profilePersonalityFilter === '바텀계열' && (score < 0 || score > 49)) return false;
          if (profilePersonalityFilter === '올계열' && (score < 50 || score > 55)) return false;
          if (profilePersonalityFilter === '탑계열' && score < 56) return false;
        }
        if (profileMbtiFilter && p.mbti !== profileMbtiFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return 0;
      });
  }, [profiles, profileSearch, profilePersonalityFilter, profileMbtiFilter, currentUserId]);

  const [suggestionContent, setSuggestionContent] = useState('');
  const [suggestionContact, setSuggestionContact] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [reportText, setReportText] = useState('');
  const reportSentKey = `reportSent_${currentUserId}`;
  const [reportSent, setReportSentRaw] = useState(() => ls.getItem(reportSentKey) === '1');
  const setReportSent = (v: boolean) => { if (v) ls.setItem(reportSentKey, '1'); else ls.removeItem(reportSentKey); setReportSentRaw(v); };
  const [reportError, setReportError] = useState<string | null>(null);
  const [drinkPicker, setDrinkPicker] = useState<string | null>(null);
  const [refreshedTab, setRefreshedTab] = useState<string | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 대기 중인 타이머 취소
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);
  const doRefresh = (tabId: string, fn: () => void) => {
    fn();
    setRefreshedTab(tabId);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      setRefreshedTab(null);
    }, 2000);
  };
  const heartsKey = `seen_hearts_${currentUserId ?? 'x'}`;
  const contactsKey = `seen_contacts_${currentUserId ?? 'x'}`;
  const profilesKey = `seen_profiles_${currentUserId ?? 'x'}`;
  const [seenHeartsCount, setSeenHeartsCountRaw] = useState(() => {
    const v = ls.getItem(heartsKey); return v !== null ? parseInt(v, 10) : 0;
  });
  const [seenProfilesCount, setSeenProfilesCountRaw] = useState(() => {
    const v = ls.getItem(profilesKey); return v !== null ? parseInt(v, 10) : -1;
  });
  const [seenContactsCount, setSeenContactsCountRaw] = useState(() => {
    const v = ls.getItem(contactsKey); return v !== null ? parseInt(v, 10) : 0;
  });

  const setSeenHeartsCount = (n: number) => { ls.setItem(heartsKey, String(n)); setSeenHeartsCountRaw(n); };
  const setSeenProfilesCount = (n: number) => { ls.setItem(profilesKey, String(n)); setSeenProfilesCountRaw(n); };
  const setSeenContactsCount = (n: number) => { ls.setItem(contactsKey, String(n)); setSeenContactsCountRaw(n); };

  const newContactsCount = Math.max(0, receivedContactShares.length - seenContactsCount);

  // On initial data load, set baseline seen counts so pre-existing data doesn't show as unread.
  // 조건: localStorage에 이전 값이 없을 때만 baseline 설정 (seen>0이면 이미 올바른 값이 있는 것)
  const baselineSetRef = useRef(false);
  useEffect(() => {
    if (baselineSetRef.current) return;
    // 데이터가 아직 하나도 로드되지 않은 초기 상태면 대기 (빈 값으로 baseline 설정 방지)
    const hasAnyData = profiles.length > 0 || pendingHeartsCount > 0 || receivedContactShares.length > 0;
    if (!hasAnyData) return;
    baselineSetRef.current = true;
    // localStorage에서 복원한 seen 값이 이미 있으면 덮어쓰지 않음 (새로 온 배지 보존)
    if (seenHeartsCount === 0) setSeenHeartsCount(pendingHeartsCount);
    if (seenContactsCount === 0) setSeenContactsCount(receivedContactShares.length);
    if (seenProfilesCount === -1 || seenProfilesCount === 0) setSeenProfilesCount(profiles.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHeartsCount, receivedContactShares.length, profiles.length]);

  // 하향 동기화: 하트/연락처 수가 줄어들었으면(상대방 취소 등) seen 카운트를 낮춰 고스트 배지 제거
  useEffect(() => {
    if (pendingHeartsCount < seenHeartsCount) setSeenHeartsCount(pendingHeartsCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHeartsCount]);
  useEffect(() => {
    if (receivedContactShares.length < seenContactsCount) setSeenContactsCount(receivedContactShares.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receivedContactShares.length]);

  // 이미 💝 탭에 있는 동안 새 연락처/하트가 도착해도 즉시 배지 클리어
  // (탭 버튼을 다시 클릭하지 않아도 보고 있으면 읽은 것으로 처리)
  useEffect(() => {
    if (mainTab === 'status') {
      setSeenContactsCount(receivedContactShares.length);
      setSeenHeartsCount(pendingHeartsCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, receivedContactShares.length, pendingHeartsCount]);

  // visibility 핸들러에서 stale closure 없이 최신 값 참조 (useEffect deps에 넣지 않아도 항상 최신)
  const pendingHeartsCountRef = useRef(pendingHeartsCount);
  pendingHeartsCountRef.current = pendingHeartsCount;
  const receivedContactSharesLenRef = useRef(receivedContactShares.length);
  receivedContactSharesLenRef.current = receivedContactShares.length;
  const seenHeartsCountRef = useRef(seenHeartsCount);
  seenHeartsCountRef.current = seenHeartsCount;
  const seenContactsCountRef = useRef(seenContactsCount);
  seenContactsCountRef.current = seenContactsCount;

  // 앱 재방문(페이지 포커스) 시 새로 온 게 없으면 배지 자동 클리어
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // seen보다 pending이 적으면 seen을 낮춰 고스트 배지 해소 (취소된 하트/연락처 처리)
      if (pendingHeartsCountRef.current < seenHeartsCountRef.current)
        setSeenHeartsCount(pendingHeartsCountRef.current);
      if (receivedContactSharesLenRef.current < seenContactsCountRef.current)
        setSeenContactsCount(receivedContactSharesLenRef.current);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 기능 잠금(functionsLocked) 시 이동 불가 탭
  const LOCKED_TABS = new Set<MainTab>(['chats', 'fortune', 'stats', 'ranking']);

  // MY 버튼 팝업 열림 상태
  const [myMenuOpen, setMyMenuOpen] = useState(false);

  const handleTabChange = (t: MainTab) => {
    if (functionsLocked && LOCKED_TABS.has(t)) return; // 기능 잠금 중 → 탭 이동 차단
    if (t === 'status') { setSeenHeartsCount(pendingHeartsCount); setSeenContactsCount(receivedContactShares.length); }
    if (t === 'profiles') setSeenProfilesCount(profiles.length);
    if (t === 'chats') { onClearMsgCount(); }
    onTabChange(t);
  };

  const QUICK_REPORTS = [
    { label: '화장실이 급해요 🚽', text: '화장실이 급해요' },
    { label: '물 주세요 💧', text: '물 주세요' },
    { label: '소주잔 주세요', text: '소주잔 주세요' },
    { label: '맥주잔 주세요', text: '맥주잔 주세요' },
    { label: '종이컵 주세요', text: '종이컵 주세요' },
    { label: '젓가락 주세요', text: '젓가락 주세요' },
    { label: '휴지 주세요', text: '휴지 주세요' },
    { label: '물티슈 주세요', text: '물티슈 주세요' },
    { label: '너무 더워요 🥵', text: '너무 더워요' },
    { label: '너무 추워요 🥶', text: '너무 추워요' },
    { label: '음악 너무 커요 🔊', text: '음악 너무 커요' },
  ];

  const DRINK_OPTIONS: Record<string, { label: string; choices: string[] }> = {
    '맥주': { label: '맥주 종류 선택', choices: ['카스', '켈리', '테라'] },
    '소주': { label: '소주 종류 선택', choices: ['진로', '대선', '참이슬', '좋은데이'] },
    '음료수': { label: '음료수 종류 선택', choices: ['코카콜라제로', '펩시제로', '웰치스', '스프라이트'] },
  };

  const sendReport = async (text: string) => {
    setReportError(null);
    try {
      await onSubmitAnonymousReport(text, tableNumber);
      setDrinkPicker(null);
      setReportSent(true);
      setReportText('');
    } catch {
      setReportError('신고 전송 실패 — 잠시 후 다시 시도해 주세요');
    }
  };

  // ── 사주 탭 생월·생일 편집 상태 ─────────────────────────────────────────────
  const [chatSearch, setChatSearch] = useState('');
  const [chatSearchLockToast, setChatSearchLockToast] = useState(false);
  const showChatSearchLockToast = () => { setChatSearchLockToast(true); setTimeout(() => setChatSearchLockToast(false), 1400); };
  const [showContactEdit, setShowContactEdit] = useState(false);
  // ── 내 상태 탭 카드 접기/펼치기 ────────────────────────────────────────────
  const [profileEditOpen, setProfileEditOpen] = useState(true);
  const [receivedHeartsOpen, setReceivedHeartsOpen] = useState(true);
  const [sentHeartsOpen, setSentHeartsOpen] = useState(true);

  // ── 프로필 편집 통합 상태 (한 섹션만 열림) ──────────────────────────────────
  const [profileEditSection, setProfileEditSection] = useState<'avatar' | 'nickname' | 'birth' | 'interests' | 'statusMsg' | 'ideal' | 'contact' | 'blocklist' | null>(null);
  const showBirthEdit = profileEditSection === 'birth';
  const showInterestEdit = profileEditSection === 'interests';
  const showAvatarPicker = profileEditSection === 'avatar';
  const showNicknameEdit = profileEditSection === 'nickname';
  const showStatusMsgEdit = profileEditSection === 'statusMsg';
  const showIdealEdit = profileEditSection === 'ideal';
  const showContactInEdit = profileEditSection === 'contact';
  const showBlockInEdit = profileEditSection === 'blocklist';
  const [showFortuneBirthEdit, setShowFortuneBirthEdit] = useState(false);
  const fortuneBirthAutoOpenedRef = useRef(false);
  const [sajuBirthMonth, setSajuBirthMonth] = useState<number | null>(null);
  const [sajuBirthDay, setSajuBirthDay] = useState<number | null>(null);
  const [sajuSaving, setSajuSaving] = useState(false);
  const sajuInitRef = useRef(false);

  // ── 내 상태 탭 연락처 편집 상태 ─────────────────────────────────────────────
  const [statusKakao, setStatusKakao] = useState('');
  const [statusInstagram, setStatusInstagram] = useState('');
  const [statusPhone, setStatusPhone] = useState('');
  const [statusContactPrivate, setStatusContactPrivate] = useState(false);
  const [statusContactSaving, setStatusContactSaving] = useState(false);
  const statusContactInitRef = useRef(false);

  // ── 닉네임 변경 상태 ────────────────────────────────────────────────────────
  const [nicknameEditInput, setNicknameEditInput] = useState('');
  const [nicknameEditError, setNicknameEditError] = useState<string | null>(null);
  const [nicknameEditChecking, setNicknameEditChecking] = useState(false);
  const [nicknameEditDupOk, setNicknameEditDupOk] = useState(false);
  const [nicknameEditSaving, setNicknameEditSaving] = useState(false);
  const nickEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 언마운트 시 닉네임 디바운스 타이머 취소
  useEffect(() => {
    return () => { if (nickEditTimerRef.current) clearTimeout(nickEditTimerRef.current); };
  }, []);

  // ── 관심사 편집 상태 ────────────────────────────────────────────────────────
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [interestFilter, setInterestFilter] = useState<string | null>(BIO_CATEGORIES[0].label);
  const [interestSaving, setInterestSaving] = useState(false);
  const interestInitRef = useRef(false);

  // 프로필 로드 시 편집 상태 초기화 (최초 1회)
  useEffect(() => {
    if (!currentUserId) {
      sajuInitRef.current = false;
      statusContactInitRef.current = false;
      return;
    }
    const me = profiles.find(p => p.id === currentUserId);
    if (!me) return;
    if (!sajuInitRef.current) {
      sajuInitRef.current = true;
      setSajuBirthMonth(me.birth_month ?? null);
      setSajuBirthDay(me.birth_day ?? null);
    }
    if (!statusContactInitRef.current) {
      statusContactInitRef.current = true;
      setStatusKakao((me as { kakao_id?: string | null }).kakao_id ?? '');
      setStatusInstagram((me as { instagram_id?: string | null }).instagram_id ?? '');
      setStatusPhone((me as { phone_number?: string | null }).phone_number ?? '');
      setStatusContactPrivate((me as { contact_private?: boolean | null }).contact_private ?? false);
    }
    if (!interestInitRef.current) {
      interestInitRef.current = true;
      setEditInterests(me.bio ? me.bio.split(',').map(t => t.trim()).filter(Boolean) : []);
    }
    // 운세탭 생월생일 섹션: 미설정 상태면 자동으로 펼치기 (최초 1회)
    if (!fortuneBirthAutoOpenedRef.current) {
      fortuneBirthAutoOpenedRef.current = true;
      if (!me.birth_month || !me.birth_day) setShowFortuneBirthEdit(true);
    }
  }, [profiles, currentUserId]);

  const saveSajuBirthDate = async () => {
    if (!currentUserId) return;
    setSajuSaving(true);
    // 월별 최대 일수 cross-validation (버튼 UI에서도 2월 30일 같은 날짜 저장 방지)
    const maxDayForMonth = (m: number | null) => m ? new Date(2000, m, 0).getDate() : 31;
    const clampedDay = (sajuBirthDay && sajuBirthMonth && sajuBirthDay > maxDayForMonth(sajuBirthMonth))
      ? maxDayForMonth(sajuBirthMonth)
      : sajuBirthDay;
    try {
      await supabase.from('profiles').update({
        birth_month: sajuBirthMonth,
        birth_day: clampedDay,
      } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, birth_month: sajuBirthMonth, birth_day: clampedDay });
      sajuInitRef.current = false;
      setProfileEditSection(null);
      setShowFortuneBirthEdit(false);
      onRefreshProfiles();
    } catch (e) { console.error('[saju] 저장 실패:', e); }
    setSajuSaving(false);
  };

  const saveInterests = async () => {
    if (!currentUserId) return;
    setInterestSaving(true);
    try {
      const bioStr = editInterests.join(', ');
      await supabase.from('profiles').update({ bio: bioStr, interests: editInterests } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, bio: bioStr, interests: editInterests as unknown as string });
      interestInitRef.current = false;
      setProfileEditSection(null);
      onRefreshProfiles();
    } catch (e) { console.error('[interests] 저장 실패:', e); }
    setInterestSaving(false);
  };

  const validateNicknameEdit = useCallback(async (val: string, currentNick: string) => {
    const t = val.trim();
    if (!t) { setNicknameEditError(null); setNicknameEditDupOk(false); return; }
    if (t.length < 2) { setNicknameEditError('최소 2글자 이상 입력하세요'); setNicknameEditDupOk(false); return; }
    if (t.length > 6) { setNicknameEditError('최대 6글자까지 입력할 수 있어요'); setNicknameEditDupOk(false); return; }
    if (containsBannedNicknameWord(t)) { setNicknameEditError('사용할 수 없는 단어가 포함되어 있어요'); setNicknameEditDupOk(false); return; }
    if (t === currentNick) { setNicknameEditError('현재 닉네임과 동일해요'); setNicknameEditDupOk(false); return; }
    setNicknameEditChecking(true);
    setNicknameEditDupOk(false);
    try {
      const { data } = await supabase.from('profiles').select('id').eq('nickname', t).limit(1);
      if (data && data.length > 0) { setNicknameEditError('이미 사용 중인 닉네임이에요'); setNicknameEditDupOk(false); }
      else { setNicknameEditError(null); setNicknameEditDupOk(true); }
    } catch { setNicknameEditError(null); setNicknameEditDupOk(true); }
    setNicknameEditChecking(false);
  }, []);

  const handleNicknameEditChange = (val: string, currentNick: string) => {
    const sliced = [...val].slice(0, 6).join('');
    setNicknameEditInput(sliced);
    setNicknameEditDupOk(false);
    setNicknameEditError(null);
    if (nickEditTimerRef.current) clearTimeout(nickEditTimerRef.current);
    nickEditTimerRef.current = setTimeout(() => validateNicknameEdit(sliced, currentNick), 500);
  };

  const saveNickname = async (currentNick: string) => {
    if (!currentUserId || !nicknameEditDupOk || nicknameEditError) return;
    const trimmed = nicknameEditInput.trim();
    if (!trimmed || trimmed === currentNick) return;
    setNicknameEditSaving(true);
    try {
      await supabase.from('profiles').update({ nickname: trimmed, nickname_changed: true } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, nickname: trimmed, nickname_changed: true });
      setProfileEditSection(null);
      setNicknameEditInput('');
      setNicknameEditDupOk(false);
      onRefreshProfiles();
    } catch (e) { console.error('[nickname] 저장 실패:', e); setNicknameEditError('저장에 실패했어요. 다시 시도해주세요.'); }
    setNicknameEditSaving(false);
  };

  const saveStatusContact = async () => {
    if (!currentUserId) return;
    setStatusContactSaving(true);
    try {
      await supabase.from('profiles').update({
        kakao_id: statusKakao.trim() || null,
        instagram_id: statusInstagram.trim() || null,
        phone_number: statusPhone.trim() || null,
        contact_private: statusContactPrivate,
      } as never).eq('id', currentUserId);
      onUpdateProfile({ id: currentUserId, kakao_id: statusKakao.trim() || null, instagram_id: statusInstagram.trim() || null, phone_number: statusPhone.trim() || null, contact_private: statusContactPrivate });
      statusContactInitRef.current = false;
      setShowContactEdit(false);
      setProfileEditSection(null);
      onRefreshProfiles();
    } catch (e) { console.error('[contact] 저장 실패:', e); }
    setStatusContactSaving(false);
  };

  // ── 프로필 사진 업로드 + 기본 아바타 피커 ────────────────────────────────────
  const [photoUploading, setPhotoUploading] = useState(false);
  const [avatarCatIdx, setAvatarCatIdx] = useState(0);

  const handleSelectPresetAvatar = async (avatarUrl: string) => {
    if (!currentUserId) return;
    await supabase.from('profiles').update({ photo_url: avatarUrl } as never).eq('id', currentUserId);
    onUpdateProfile({ id: currentUserId, photo_url: avatarUrl });
    onRefreshProfiles();
    setProfileEditSection(null);
  };
  // 이미지 압축: 최대 1200px, JPEG 품질 0.92 — 화질 유지 + 메모리/DB 과부하 방지
  const compressImage = (dataUrl: string, maxPx = 1200, quality = 0.92): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // 압축 실패 시 원본 사용
      img.src = dataUrl;
    });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;
    setPhotoUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const dataUrl = ev.target?.result as string;
          if (!dataUrl) { setPhotoUploading(false); return; }
          const compressed = await compressImage(dataUrl);
          const path = `profile-photos/${currentUserId}`;
          await fetch('/api/db/storage-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, dataUrl: compressed }),
          });
          const photoUrl = `/api/db/storage-image?p=${encodeURIComponent(path)}&t=${Date.now()}`;
          await supabase.from('profiles').update({ photo_url: photoUrl } as never).eq('id', currentUserId);
          onUpdateProfile({ id: currentUserId, photo_url: photoUrl });
          onRefreshProfiles();
        } catch (e) {
          console.error('[MainScreen] 사진 업로드 실패:', e);
          alert('사진 업로드 중 오류가 발생했습니다. 다시 시도해 주세요.');
        } finally {
          setPhotoUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch { setPhotoUploading(false); }
    // 같은 파일 재선택 허용
    e.target.value = '';
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <header className={`sticky top-0 z-10 transition-colors duration-300 ${darkMode ? 'bg-slate-900 border-b-2 border-slate-700 shadow-slate-950/50' : 'bg-white shadow-sm'}`}>
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-3 items-center">
          {/* 좌: 튜토리얼 + 다크모드 + 배경음악 */}
          <div className="justify-self-start flex items-center gap-1">
            <button
              onClick={() => onShowTutorial()}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-all active:scale-95 ${darkMode ? 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800' : 'text-gray-500 hover:text-cyan-600 hover:bg-cyan-50'}`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="text-[9px] font-semibold">튜토리얼</span>
            </button>
            <button onClick={onToggleDark}
              className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-700 text-amber-400 hover:bg-slate-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
              title={darkMode ? '라이트 모드' : '다크 모드'}>
              {darkMode ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
              )}
            </button>
          </div>
          {/* 중앙: 타이틀 */}
          <div className="justify-self-center">
            <ResetButton onReset={onReset} darkMode={darkMode} resetPassword={resetPassword} onEasterEgg={() => onSubmitSuggestion('__술주세요__', '')} />
          </div>
          {/* 우: 하트 */}
          <div className="justify-self-end flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {HEART_TYPES.map(h => {
                const used = heartCount(h.type);
                return (
                  <div key={h.type} className="flex items-center gap-0.5" title={`${h.label} (${2-used}개 남음)`}>
                    <span className="text-sm leading-none">{h.emoji}</span>
                    <span className={`text-[10px] font-bold ${used >= 2 ? 'text-gray-400 line-through' : darkMode ? 'text-gray-300' : 'text-gray-500'}`}>{2-used}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {timerEndAt && <TimerBanner endAt={timerEndAt} label={timerLabel ?? ''} />}
        {/* ── 탭 바 (1행 × 3열: 참여자 | 통계 | 랭킹) ── */}
        <div className={`max-w-7xl mx-auto border-t-2 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex">
            {([
              { id: 'profiles' as MainTab, icon: '👥', label: '참여자', badge: seenProfilesCount < 0 ? 0 : Math.max(0, profiles.length - seenProfilesCount) },
              { id: 'stats' as MainTab, icon: '📊', label: '통계' },
              { id: 'ranking' as MainTab, icon: '🏆', label: '랭킹' },
            ] as Array<{ id: MainTab; icon: string; label: string; badge?: number }>).map((t, ci, arr) => {
              const locked = functionsLocked && LOCKED_TABS.has(t.id);
              const active = mainTab === t.id;
              return (
                <button key={t.id} onClick={() => handleTabChange(t.id)} disabled={locked}
                  className={`relative flex-1 py-3 flex flex-col items-center gap-1 transition-all active:scale-95 border-b-2 ${ci < arr.length - 1 ? (darkMode ? 'border-r border-slate-700/30' : 'border-r border-gray-200/70') : ''} ${
                    locked ? `opacity-35 cursor-not-allowed border-b-transparent ${darkMode ? 'text-slate-500' : 'text-gray-400'}` :
                    active ? darkMode ? 'border-b-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-b-cyan-500 text-cyan-700 bg-cyan-50' :
                    darkMode ? 'border-b-transparent text-slate-400' : 'border-b-transparent text-gray-500'
                  }`}>
                  <span className="text-lg leading-none">{locked ? '🔒' : t.icon}</span>
                  <span className="relative inline-flex text-[10px] font-bold leading-tight">
                    {t.label}
                    {!locked && (t.badge ?? 0) > 0 && (
                      <span className="absolute -top-1 -right-3 min-w-[13px] h-[13px] px-0.5 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                        {t.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 scrollbar-styled-light">
        {mainTab === 'profiles' && (
          <>
            {/* 검색 + 필터 바 */}
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={profileSearch}
                    onChange={e => setProfileSearch(e.target.value)}
                    placeholder="닉네임 · MBTI · 성향 · 초성 검색"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-teal-400 focus:outline-none shadow-sm"
                  />
                </div>
                <RefreshBtn onRefresh={() => doRefresh('profiles', onRefreshProfiles)} refreshed={refreshedTab === 'profiles'} />
              </div>
              {/* 검색 힌트 */}
              <p className="text-[10px] text-gray-400 px-1 -mt-0.5">
                💡 닉네임·MBTI·성향(탑/바텀/올)·초성으로 검색할 수 있어요
              </p>
              {/* 성향 필터 */}
              <div className={`flex gap-1.5 overflow-x-auto pb-1 scrollbar-styled-light`}>
                {[null,'바텀계열','올계열','탑계열','비선호'].map(f => {
                  const colorMap: Record<string, string> = {
                    '바텀계열': 'bg-green-500 text-white border-green-500',
                    '올계열':   'bg-amber-500 text-white border-amber-500',
                    '탑계열':   'bg-blue-500 text-white border-blue-500',
                    '비선호':   'bg-gray-500 text-white border-gray-500',
                  };
                  const active = profilePersonalityFilter === f;
                  return (
                    <button key={String(f)} onClick={() => setProfilePersonalityFilter(active ? null : f)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${active ? (f ? colorMap[f] : 'bg-teal-500 text-white border-teal-500') : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                      {f ?? '전체'}
                    </button>
                  );
                })}
              </div>
              {/* MBTI 필터 — 8열 2행 고정 그리드 (스크롤 없음, 전체 버튼 없음) */}
              <div className="grid grid-cols-8 gap-1">
                {['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'].map(m => {
                  const active = profileMbtiFilter === m;
                  return (
                    <button key={m} onClick={() => setProfileMbtiFilter(active ? null : m)}
                      className={`px-1 py-1.5 rounded-md text-[10px] font-bold border transition-all text-center ${active ? 'bg-cyan-500 text-white border-cyan-500' : 'bg-white text-gray-500 border-gray-200 hover:border-cyan-300'}`}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── 참여자 그리드 (이 영역만 스크롤) ───────── */}
            <div className="overflow-y-auto -mx-4 px-4 pb-6" style={{ maxHeight: 'calc(100dvh - 330px)', minHeight: 160 }}>
            <div className="grid grid-cols-3 gap-2">
            {filteredProfiles.filter(p => p.id !== currentUserId).map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                isLiked={likedIds.has(profile.id)}
                sentHeartType={sentHeartTypes.get(profile.id)}
                heartCount={sentHeartsPerPerson.get(profile.id)?.size ?? 0}
                canLike={!!(currentUserId && profile.id !== currentUserId)}
                locked={functionsLocked}
                onLike={onLike}
                onSelect={onSelect}
                onOpenChat={onOpenChat}
                onBlock={onBlock}
                onContactShare={_onContactShareOpen}
                onViewFortune={onViewFortune}
                idealMsg={userSignals.find(s => s.user_id === profile.id)?.ideal_msg}
                statusMsg={userSignals.find(s => s.user_id === profile.id)?.status_msg}
              />
            ))}
            {filteredProfiles.filter(p => p.id !== currentUserId).length === 0 && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 text-center py-20">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">{profileSearch || profilePersonalityFilter || profileMbtiFilter ? '검색 결과가 없습니다.' : '아직 다른 참가자가 없습니다.'}</p>
              </div>
            )}
          </div>
          </div>{/* /scroll-wrapper */}
          </>
        )}

        {mainTab === 'status' && (
          <StatusErrorBoundary>
          <div className="max-w-lg mx-auto space-y-4">
            {/* ── 내 프로필 카드 ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const posLabel = getPositionLabel(me.personality_score ?? 50);
              const posColor = getPositionBg(me.personality_score ?? 50);
              const domLabel = getDomSubLabel(me.dom_sub_score ?? null);
              const domColor = getDomSubBg(me.dom_sub_score ?? null);
              const bioTags = me.bio ? me.bio.split(',').map(t => t.trim()).filter(Boolean) : [];
              const hidePersonality = (me as { hide_personality?: boolean }).hide_personality ?? true;
              const handleToggleHidePersonality = async () => {
                const next = !hidePersonality;
                if (!currentUserId) return;
                try {
                  await supabase.from('profiles').update({ hide_personality: next } as never).eq('id', currentUserId);
                  onUpdateProfile({ id: currentUserId, hide_personality: next } as never);
                } catch (e) { console.error('[hide_personality]', e); }
              };
              return (
                <div className={`rounded-3xl p-5 border shadow-xl transition-colors duration-300 ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>내 프로필</p>
                    <RefreshBtn onRefresh={() => doRefresh('status', onRefreshStatus)} refreshed={refreshedTab === 'status'} />
                  </div>

                  {/* ── 닉네임 (사진 위) ── */}
                  <div className="mb-2">
                    <p className={`text-xl font-black leading-tight truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{me.nickname}</p>
                  </div>

                  {/* ── 사진(왼쪽) + 박스(오른쪽) — 상단 정렬 ── */}
                  <div className="flex gap-3 items-start">
                    {/* 사진 — MBTI 레이블 높이(약 17px)만큼 내려서 박스 상단과 정렬 */}
                    <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-[17px]">
                      <div className="relative w-32 h-32">
                        <label className={`block w-full h-full rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/20 cursor-pointer group ${photoUploading ? 'cursor-wait' : ''}`}>
                          <img src={getAvatarSrc(me.photo_url, me.nickname)} alt={me.nickname} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(me.nickname); }} />
                          <div className={`absolute inset-0 flex flex-col items-center justify-center photo-overlay transition-all ${photoUploading ? 'bg-black/60' : 'bg-black/0 group-hover:bg-black/50'}`}>
                            {photoUploading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 flex flex-col items-center gap-0.5 transition-opacity">
                                <Camera className="w-5 h-5 text-white drop-shadow" />
                                <span className="text-[9px] font-black text-white drop-shadow">변경</span>
                              </div>
                            )}
                          </div>
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        {!photoUploading && (
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-cyan-500 border-2 border-slate-900 flex items-center justify-center pointer-events-none shadow">
                            <Camera className="w-2.5 h-2.5 text-white" />
                          </span>
                        )}
                      </div>
                      {(() => {
                        const avLabel = AVATAR_CATEGORIES.flatMap(c => c.avatars).find(a => a.src === me.photo_url)?.label;
                        return avLabel ? <span className={`text-[9px] font-bold text-center leading-tight ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>{avLabel}</span> : null;
                      })()}
                    </div>

                    {/* 오른쪽: 2×2 박스 */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      {/* 2×2 정보 박스 — 레이블 외부 상단, 폰트 통일 */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 ml-auto">
                        {/* MBTI */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>MBTI</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: darkMode ? 'linear-gradient(135deg,rgba(13,148,136,.85),rgba(6,182,212,.60))' : 'linear-gradient(135deg,rgba(13,148,136,.70),rgba(6,182,212,.50))',
                            border: '1.5px solid rgba(20,184,166,.70)',
                            boxShadow: darkMode ? '0 0 14px rgba(20,184,166,.30)' : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{me.mbti || '—'}</span>
                          </div>
                        </div>

                        {/* 성향 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>성향</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: `linear-gradient(135deg,${posColor}cc,${posColor}88)`,
                            border: `1.5px solid ${posColor}`,
                            boxShadow: darkMode ? `0 0 14px ${posColor}44` : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{posLabel}</span>
                          </div>
                        </div>

                        {/* 돔/섭 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>돔/섭</span>
                          <div className="w-16 h-14 rounded-2xl flex items-center justify-center" style={{
                            background: `linear-gradient(135deg,${domColor}cc,${domColor}88)`,
                            border: `1.5px solid ${domColor}`,
                            boxShadow: darkMode ? `0 0 14px ${domColor}44` : 'none'
                          }}>
                            <span className="text-xs font-black text-white drop-shadow">{domLabel}</span>
                          </div>
                        </div>

                        {/* 관심사 */}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`text-[10px] font-black tracking-wide ${darkMode ? 'text-white' : 'text-gray-800'}`}>관심사</span>
                          <div className="w-16 h-14 rounded-2xl flex flex-col items-center justify-center gap-px" style={{
                            background: darkMode ? 'linear-gradient(135deg,rgba(219,39,119,.80),rgba(236,72,153,.55))' : 'linear-gradient(135deg,rgba(219,39,119,.65),rgba(236,72,153,.45))',
                            border: '1.5px solid rgba(236,72,153,.80)',
                            boxShadow: darkMode ? '0 0 14px rgba(236,72,153,.30)' : 'none'
                          }}>
                            {bioTags.length > 0 ? bioTags.slice(0, 2).map(tag => (
                              <span key={tag} className="text-[10px] font-black text-white drop-shadow leading-tight">#{tag}</span>
                            )) : (
                              <span className="text-xs text-white/60">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* ── QR / 고유번호 ── */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      onClick={onShowContactQr}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl font-bold transition-all active:scale-95 border ${darkMode ? 'bg-violet-500/15 border-violet-500/30 text-violet-400 hover:bg-violet-500/25' : 'bg-violet-50 border-violet-200 text-violet-600 hover:bg-violet-100'}`}
                    >
                      <QrCode className="w-5 h-5" />
                      <span className="text-[10px] leading-tight text-center">연락처<br/>QR</span>
                    </button>
                    <button
                      onClick={onScanQr}
                      className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl font-bold transition-all active:scale-95 border ${darkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'}`}
                    >
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px] leading-tight text-center">QR<br/>찍기</span>
                    </button>
                    {me.pin_code ? (
                      <div className={`flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border-2 ${darkMode ? 'bg-amber-500/15 border-amber-500/40' : 'bg-amber-50 border-amber-300'}`}>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${darkMode ? 'text-amber-400' : 'text-amber-500'}`}>🔑 고유번호</span>
                        <span className={`text-xl font-black tracking-[0.25em] ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{me.pin_code}</span>
                      </div>
                    ) : (
                      <div className={`flex flex-col items-center justify-center gap-0.5 py-2.5 rounded-2xl border ${darkMode ? 'bg-slate-700/60 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                        <span className="text-[9px] font-semibold text-center leading-tight">고유번호<br/>없음</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}


            {/* ── 스캔한 연락처 ── */}
            {scannedContacts.length > 0 && (
              <div className={`rounded-2xl border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                <div className="p-4 pb-2">
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>📋 스캔한 연락처 ({scannedContacts.length})</p>
                  <div className="space-y-2">
                    {scannedContacts.map(c => (
                      <div key={c.id} className={`rounded-xl p-3 border flex items-start gap-3 ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
                        {/* 아바타 */}
                        <div className="flex-shrink-0">
                          {c.photo_url ? (
                            <img src={c.photo_url} alt={c.nickname} loading="lazy" className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm">{c.nickname?.[0] ?? '?'}</div>
                          )}
                        </div>
                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.nickname}</span>
                            {c.mbti && <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-400 text-[10px] font-bold rounded-md border border-teal-500/30">{c.mbti}</span>}
                          </div>
                          {c.contact_private ? (
                            <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>🔒 연락처 비공개</p>
                          ) : (
                            <div className="space-y-0.5">
                              {c.kakao_id && <p className={`text-[11px] font-medium ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>🟡 카카오: {c.kakao_id}</p>}
                              {c.instagram_id && <p className={`text-[11px] font-medium ${darkMode ? 'text-pink-400' : 'text-pink-600'}`}>📸 인스타: @{c.instagram_id}</p>}
                              {c.phone_number && <p className={`text-[11px] font-medium ${darkMode ? 'text-green-400' : 'text-green-600'}`}>📞 전화: {c.phone_number}</p>}
                              {!c.kakao_id && !c.instagram_id && !c.phone_number && (
                                <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>연락처 미등록</p>
                              )}
                            </div>
                          )}
                        </div>
                        {/* 삭제 */}
                        <button
                          onClick={() => onClearScannedContact(c.id)}
                          className={`flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-90 ${darkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-200'}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="px-4 pb-3">
                  <button onClick={() => scannedContacts.forEach(c => onClearScannedContact(c.id))}
                    className={`text-[11px] font-semibold transition-all ${darkMode ? 'text-slate-500 hover:text-slate-400' : 'text-gray-300 hover:text-gray-400'}`}>
                    전체 삭제
                  </button>
                </div>
              </div>
            )}


            {/* ── 방문자 기록 (접기/펼치기) ── */}
            {(() => {
              const visitors = [...profileVisitors]
                .sort((a, b) => b.viewed_at.localeCompare(a.viewed_at))
                .filter((v, i, arr) => arr.findIndex(x => x.viewer_id === v.viewer_id) === i);
              return (
                <div className={`rounded-3xl border shadow-xl transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <button onClick={() => setShowVisitors(v => !v)} className="w-full flex items-center justify-between px-5 py-4">
                    <span className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                      👁 내 프로필 방문자 {visitors.length > 0 ? `(${visitors.length})` : ''}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showVisitors ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                  </button>
                  {showVisitors && (
                    <div className="px-5 pb-5">
                      {visitors.length === 0 ? (
                        <p className={`text-xs text-center py-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>아직 방문자가 없어요</p>
                      ) : (
                        <div className="space-y-2">
                          {visitors.slice(0, 20).map(v => {
                            const vp = profiles.find(p => p.id === v.viewer_id);
                            if (!vp) return null;
                            const ago = (() => {
                              const ms = Date.now() - new Date(v.viewed_at).getTime();
                              if (ms < 60_000) return '방금 전';
                              if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
                              if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
                              return `${Math.floor(ms / 86_400_000)}일 전`;
                            })();
                            return (
                              <button key={v.id} type="button" onClick={() => onSelect(vp)} className={`w-full flex items-center gap-3 p-2 rounded-xl text-left cursor-pointer active:scale-[0.98] transition-transform ${darkMode ? 'bg-slate-700/40 hover:bg-slate-700/70' : 'bg-gray-50 hover:bg-gray-100'}`}>
                                <img src={vp.photo_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(vp.nickname)}`} alt={vp.nickname}
                                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(vp.nickname)}`; }} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{vp.nickname}</p>
                                  {vp.mbti && <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{vp.mbti}</p>}
                                </div>
                                <span className={`text-[10px] flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{ago}</span>
                              </button>
                            );
                          })}
                          {visitors.length > 20 && <p className={`text-[10px] text-center mt-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>+{visitors.length - 20}명 더</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="contents">
            {/* 받은 하트 */}
            <div className={`rounded-2xl shadow-sm transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <button
                onClick={() => setReceivedHeartsOpen(o => !o)}
                className={`w-full flex items-center justify-between px-5 py-4 ${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}`}
              >
                <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-gray-500'}`}>💕 받은 하트</h3>
                <div className="flex items-center gap-2">
                  {pendingHeartsCount > 0 && (
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-600 text-xs font-bold rounded-full">
                      {pendingHeartsCount}개 미응답
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${receivedHeartsOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                </div>
              </button>
              {receivedHeartsOpen && (
              <div className="px-5 pb-5">
              {receivedLikers.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 받은 하트가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {receivedLikers.map((liker) => {
                    const shared = contactSharedWithIds.has(liker.id);
                    const ht = receivedHeartTypes.get(liker.id) ?? 'red';
                    const hm = heartMeta(ht);
                    const isGreen = ht === 'green';
                    const isAcked = acknowledgedComplimentIds.has(liker.id);
                    return (
                      <div key={liker.id} className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/70' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar profile={liker} size="sm" rounded="xl" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{liker.nickname}</p>
                            <p className={`text-xs ${hm.text}`}>{hm.emoji} {hm.label} 하트를 보냈습니다</p>
                          </div>
                          {shared && (
                            <button
                              onClick={() => {
                                const share = receivedContactShares.find(s => s.liker_id === liker.id);
                                if (share) onContactViewOpen(share, liker);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-full border border-teal-200 hover:bg-teal-100 transition-all">
                              <CheckCircle className="w-3 h-3" />연락처 공유 완료</button>
                          )}
                          {isGreen && isAcked && (
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-600 text-xs font-bold rounded-full border border-emerald-200">
                              <CheckCircle className="w-3 h-3" />확인 완료
                            </span>
                          )}
                        </div>
                        <ProfileInfoBadges profile={liker} />
                        {isGreen ? (
                          !isAcked && (
                            <button
                              onClick={() => onHeartResponse(liker.id, 'accepted')}
                              className={`w-full py-2 mt-2.5 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                            >{'확인'}</button>
                          )
                        ) : (
                          !shared && (
                            <div className="flex gap-2 mt-2.5">
                              <button
                                onClick={() => onHeartResponse(liker.id, 'rejected')}
                                className="flex-1 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >거절</button>
                              <button
                                onClick={() => onHeartResponse(liker.id, 'accepted')}
                                className={`flex-2 flex-grow py-2 text-xs font-bold text-white rounded-xl transition-all ${hm.solidBg} ${hm.solidHover}`}
                              >{'수락 + 연락처 공유'}</button>
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              )}
            </div>

            {/* 교환된 연락처 */}
            {receivedContactShares.length > 0 && (
              <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${darkMode ? 'bg-teal-900/60' : 'bg-teal-50'}`}>
                    <span className="text-sm">📱</span>
                  </div>
                  <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-200' : 'text-gray-700'}`}>교환된 연락처</h3>
                  <span className="ml-auto px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">{receivedContactShares.length}개</span>
                </div>
                <div className="space-y-2">
                  {receivedContactShares.map((share) => {
                    const sharedProfile = profileMap.get(share.liked_id);
                    return (
                      <div key={share.id} className={`rounded-xl p-3 ${darkMode ? 'bg-teal-900/30 border border-teal-800' : 'bg-teal-50 border border-teal-100'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {sharedProfile && <ProfileAvatar profile={sharedProfile} size="xs" rounded="lg" />}
                          <p className={`text-xs font-bold ${darkMode ? 'text-teal-300' : 'text-teal-800'}`}>
                            {sharedProfile?.nickname ?? '알 수 없음'}
                          </p>
                          <button
                            onClick={() => sharedProfile && onContactViewOpen(share, sharedProfile)}
                            className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all ${darkMode ? 'bg-teal-800 border-teal-700 text-teal-200 hover:bg-teal-700' : 'bg-white border-teal-200 text-teal-600 hover:bg-teal-100'}`}
                          >
                            <Eye className="w-3 h-3" />보기
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {share.kakao && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-yellow-900/40 text-yellow-300' : 'bg-yellow-50 text-yellow-700'}`}>
                              <span className="text-[10px]">K</span>{share.kakao}
                            </span>
                          )}
                          {share.instagram && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-pink-900/40 text-pink-300' : 'bg-pink-50 text-pink-700'}`}>
                              IG {share.instagram}
                            </span>
                          )}
                          {share.phone && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${darkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                              📞 {share.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}

            {/* 보낸 하트 */}
            <div className={`rounded-2xl shadow-sm transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <button
                onClick={() => setSentHeartsOpen(o => !o)}
                className={`w-full flex items-center justify-between px-5 py-4 ${darkMode ? 'hover:bg-slate-700/40' : 'hover:bg-gray-50'}`}
              >
                <h3 className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>💌 보낸 하트</h3>
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${sentHeartsOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
              </button>
              {sentHeartsOpen && (
              <div className="px-5 pb-5">
              {sentLikedProfiles.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className={`w-10 h-10 mx-auto mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 보낸 하트가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentLikedProfiles.map((liked) => {
                    const share = receivedContactShares.find((s) => s.liked_id === liked.id);
                    const ht = sentHeartTypes.get(liked.id) ?? 'red';
                    const hm = heartMeta(ht);
                    return (
                      <div key={liked.id}
                        className={`flex flex-col p-3 rounded-xl transition-all ${darkMode ? 'bg-slate-700/70' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <ProfileAvatar profile={liked} size="sm" rounded="xl" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{liked.nickname}</p>
                            <p className={`text-xs ${hm.text}`}>{hm.emoji} {hm.label}</p>
                          </div>
                          {share ? (
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-600 text-xs font-bold rounded-full border border-teal-200 cursor-pointer" onClick={() => onContactViewOpen(share, liked)}>
                              <Eye className="w-3 h-3" />
                              연락처 확인
                            </span>
                          ) : ht === 'green' ? (
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-500 text-xs rounded-full">
                              전달 완료
                            </span>
                          ) : likeStatuses.get(liked.id) === 'rejected' ? (
                            <span className="px-2.5 py-1 bg-red-50 text-red-400 text-xs rounded-full">
                              💔 거부됨
                            </span>
                          ) : likeStatuses.get(liked.id) === 'accepted' ? (
                            <span className="px-2.5 py-1 bg-teal-50 text-teal-500 text-xs rounded-full">
                              ✓ 수락됨
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-400 text-xs rounded-full">
                              대기 중
                            </span>
                          )}
                        </div>
                        <ProfileInfoBadges profile={liked} />
                        {share && (share.kakao || share.instagram || share.phone) && (
                          <div className="mt-2.5 bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-1.5">
                            <p className={`text-[10px] font-black uppercase tracking-widest ${darkMode ? 'text-teal-300' : 'text-teal-600'} mb-1`}>{liked.nickname}님이 공유한 연락처</p>
                            {share.kakao && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-yellow-400 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">K</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">{share.kakao}</span>
                                <button onClick={() => navigator.clipboard.writeText(share.kakao!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.instagram && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-pink-500 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">@</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">@{share.instagram}</span>
                                <button onClick={() => navigator.clipboard.writeText(share.instagram!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                            {share.phone && (
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-lg bg-green-500 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">#</span>
                                <span className="text-xs font-bold text-gray-800 flex-1">{share.phone}</span>
                                <button onClick={() => navigator.clipboard.writeText(share.phone!)} className="text-[10px] text-gray-400 hover:text-teal-600 transition-all">복사</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              )}
            </div>

            </div>
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 내 설정 탭 ─── */}
        {mainTab === 'settings' && (
          <StatusErrorBoundary>
          <div className="max-w-lg mx-auto space-y-4 pb-24">

            {/* ── 고유번호 ── */}
            {(() => {
              const pinCode = profiles.find(p => p.id === currentUserId)?.pin_code;
              return (
                <div className={`rounded-3xl border shadow-xl overflow-hidden ${darkMode ? 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <div className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-lg ${darkMode ? 'bg-amber-500/20' : 'bg-amber-50'}`}>🔑</div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>내 고유번호</p>
                        {pinCode ? (
                          <p className={`text-2xl font-black tracking-[0.3em] leading-none ${darkMode ? 'text-amber-300' : 'text-amber-600'}`}>{pinCode}</p>
                        ) : (
                          <p className={`text-sm font-bold ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>번호 없음</p>
                        )}
                      </div>
                    </div>
                    {pinCode && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(pinCode).catch(() => {});
                        }}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border transition-all active:scale-95 ${darkMode ? 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                        복사
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── 프로필 편집 (통합) ── */}
            {(() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const currentTags = me.bio ? me.bio.split(',').map(t => t.trim()).filter(Boolean) : [];
              const hasBd = !!(me.birth_month && me.birth_day);
              const atMax = editInterests.length >= 5;
              const toggleTag = (tag: string) => {
                // 함수형 업데이트 대신 직접 계산 — setTimeout 클로저 stale 문제 방지
                const next = editInterests.includes(tag)
                  ? editInterests.filter(t => t !== tag)
                  : editInterests.length < 5 ? [...editInterests, tag] : editInterests;
                setEditInterests(next);
                // 2번째 관심사를 막 선택한 순간 → 즉시 저장 + 닫기
                if (next.length >= 2 && editInterests.length < 2 && currentUserId) {
                  const bioStr = next.join(', ');
                  setInterestSaving(true);
                  supabase.from('profiles').update({ bio: bioStr, interests: next } as never).eq('id', currentUserId)
                    .then(() => {
                      onUpdateProfile({ id: currentUserId!, bio: bioStr, interests: next as unknown as string });
                      interestInitRef.current = false;
                      setInterestSaving(false);
                      onRefreshProfiles();
                    })
                    .catch((e: unknown) => { console.error('[interests auto]', e); setInterestSaving(false); });
                  setProfileEditSection(null);
                }
              };
              const toggleSection = (s: 'avatar' | 'nickname' | 'birth' | 'interests' | 'statusMsg' | 'ideal' | 'contact' | 'blocklist') => {
                if (s === 'nickname') {
                  // 이미 1회 변경한 경우 열기 차단
                  if ((me as { nickname_changed?: boolean }).nickname_changed) return;
                  if (profileEditSection !== 'nickname') {
                    setNicknameEditInput('');
                    setNicknameEditError(null);
                    setNicknameEditDupOk(false);
                  }
                }
                if (s === 'interests' && profileEditSection !== 'interests') {
                  interestInitRef.current = false;
                  setEditInterests(currentTags);
                }
                setProfileEditSection(p => p === s ? null : s);
              };
              return (
                <div className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-100'}`}>
                  <button
                    onClick={() => setProfileEditOpen(o => !o)}
                    className={`w-full flex items-center justify-between px-4 py-3 border-b transition-colors ${darkMode ? 'border-slate-700 hover:bg-slate-700/40' : 'border-gray-100 hover:bg-gray-50'}`}
                  >
                    <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>✏️ 프로필 편집</p>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${profileEditOpen ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                  </button>
                  {profileEditOpen && (
                  <>

                  {/* ── 사진·아바타 ── */}
                  <div className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('avatar')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      {me.photo_url ? (
                        <img src={me.photo_url} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-white/10" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">{me.nickname?.[0] ?? '?'}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>사진 · 아바타</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>탭하여 사진 또는 아바타 변경</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showAvatarPicker ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showAvatarPicker && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <label className={`flex items-center gap-3 p-3 mb-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${darkMode ? 'border-slate-600 hover:border-cyan-500 bg-slate-800/60' : 'border-gray-200 hover:border-cyan-400 bg-white'}`}>
                          <Camera className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-700'}`}>내 사진 업로드</p>
                            <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>JPG/PNG · 자동 압축</p>
                          </div>
                          {photoUploading && <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        <p className={`text-[11px] font-black mb-1 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>🎨 기본 아바타 선택</p>
                        <p className={`text-[9px] mb-2 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>⚠️ 저작권으로 인하여 아래와 같은 아바타 밖에 만들지 못합니다.</p>
                        <div className={`flex flex-wrap gap-1 mb-2 pb-2 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
                          {AVATAR_CATEGORIES.map((cat, idx) => (
                            <button key={cat.label} type="button" onClick={() => setAvatarCatIdx(idx)}
                              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                                avatarCatIdx === idx ? 'bg-cyan-500 text-white shadow-sm' :
                                darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-white text-gray-600 border border-gray-200 hover:border-cyan-300'
                              }`}>{cat.label}</button>
                          ))}
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                          {AVATAR_CATEGORIES[avatarCatIdx]?.avatars.map((av) => {
                            const isSel = me.photo_url === av.src;
                            return (
                              <button key={av.id} type="button" onClick={() => handleSelectPresetAvatar(av.src)}
                                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 shadow-sm transition-all active:scale-95 ${
                                  isSel ? 'border-cyan-500 bg-cyan-50' :
                                  darkMode ? 'border-slate-600 bg-slate-700/70 hover:border-cyan-400' : 'border-gray-200 bg-white hover:border-cyan-300 hover:shadow-md'
                                }`}>
                                <img src={av.src} alt={av.label} className="w-12 h-12 rounded-full object-cover block"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                <span className={`text-[10px] font-bold leading-tight text-center w-full truncate ${isSel ? 'text-cyan-600' : darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{av.label}</span>
                                {isSel && <span className="absolute top-1 right-1 w-4 h-4 bg-cyan-500 rounded-full flex items-center justify-center shadow"><CheckCircle className="w-2.5 h-2.5 text-white" /></span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── 닉네임 ── */}
                  {(() => {
                    const nicknameAlreadyChanged = !!(me as { nickname_changed?: boolean }).nickname_changed;
                    return (
                      <div className={`border-b ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                        <button
                          onClick={() => toggleSection('nickname')}
                          disabled={nicknameAlreadyChanged}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left ${nicknameAlreadyChanged ? 'cursor-not-allowed' : ''}`}
                        >
                          <span className="text-xl flex-shrink-0">{nicknameAlreadyChanged ? '🔒' : '🏷️'}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>닉네임</p>
                            <p className={`text-[11px] font-semibold break-all ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{me.nickname}</p>
                            {nicknameAlreadyChanged && (
                              <p className={`text-[10px] mt-0.5 font-medium ${darkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>닉네임 변경은 1회만 가능해요</p>
                            )}
                          </div>
                          {nicknameAlreadyChanged
                            ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-100 text-gray-400'}`}>변경 완료</span>
                            : <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showNicknameEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                          }
                        </button>
                        {showNicknameEdit && !nicknameAlreadyChanged && (
                          <div className={`px-4 pb-4 space-y-2 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                            {/* 1회 변경 경고 배너 */}
                            <div className={`flex items-start gap-2 px-3 py-2 rounded-xl ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                              <span className="text-sm flex-shrink-0">⚠️</span>
                              <p className={`text-[11px] font-bold leading-snug ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                                닉네임은 <span className="underline">단 1회만</span> 변경할 수 있어요.<br />
                                변경 후에는 되돌릴 수 없으니 신중하게 입력해 주세요.
                              </p>
                            </div>
                            <div className="relative">
                              <input type="text" value={nicknameEditInput}
                                onChange={(e) => handleNicknameEditChange(e.target.value, me.nickname)}
                                maxLength={6} autoFocus placeholder="새 닉네임 (2~6글자)"
                                className={`w-full px-3 py-2 rounded-lg border-2 text-sm font-bold transition-all outline-none ${
                                  darkMode ? 'bg-slate-800 text-white placeholder-slate-500' : 'bg-white text-gray-900'
                                } ${nicknameEditError ? 'border-rose-400' : nicknameEditDupOk ? 'border-emerald-400' : darkMode ? 'border-slate-500 focus:border-cyan-500' : 'border-gray-300 focus:border-cyan-400'}`}
                              />
                              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold">
                                {nicknameEditChecking && <span className={darkMode ? 'text-slate-400' : 'text-gray-400'}>확인 중…</span>}
                                {!nicknameEditChecking && nicknameEditDupOk && !nicknameEditError && <span className="text-emerald-500">사용 가능 ✓</span>}
                              </div>
                            </div>
                            {nicknameEditError && <p className="text-[11px] text-rose-500 font-medium">⚠ {nicknameEditError}</p>}
                            <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>최소 2글자 · 최대 6글자 · 욕설·지역감정·패드립 불가</p>
                            <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-teal-400/70' : 'text-teal-600/70'}`}>💡 예시: 음식이름, 패션스타일, 직업 등 나를 나타낼 수 있는 거 아무거나 설정해 주세요!</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setProfileEditSection(null)}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${darkMode ? 'bg-slate-600 text-slate-300 hover:bg-slate-500' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>취소</button>
                              <button type="button" onClick={() => saveNickname(me.nickname)}
                                disabled={!nicknameEditDupOk || !!nicknameEditError || nicknameEditSaving}
                                className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-teal-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                                {nicknameEditSaving ? '저장 중…' : '저장'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── 관심사 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('interests')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🎯</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>관심사</p>
                        {currentTags.length > 0
                          ? <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{currentTags.join(' · ')}</p>
                          : <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</p>}
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${currentTags.length >= 2 ? 'bg-teal-500 text-white' : darkMode ? 'bg-slate-700 text-slate-500' : 'bg-gray-100 text-gray-400'}`}>{currentTags.length}/5</span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showInterestEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showInterestEdit && (
                      <div className={`px-4 pb-4 space-y-3 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {editInterests.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl border bg-cyan-50 border-cyan-100">
                            {editInterests.map(tag => (
                              <button key={tag} type="button" onClick={() => toggleTag(tag)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all active:scale-95">
                                {tag} <span className="opacity-70 text-[10px]">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1.5 flex-wrap">
                          {BIO_CATEGORIES.map(cat => {
                            const active = interestFilter === cat.label;
                            const hasSelected = cat.tags.some(t => editInterests.includes(t));
                            return (
                              <button key={cat.label} type="button" onClick={() => setInterestFilter(cat.label)}
                                className={`relative px-3 py-1.5 rounded-full text-xs font-black border transition-all ${active ? `${cat.color.selected} border-transparent` : (darkMode ? `bg-slate-700 border-slate-600 ${cat.color.label} hover:border-current` : `bg-white border-gray-200 ${cat.color.label} hover:border-current`)}`}>
                                {cat.label}
                                {hasSelected && !active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-cyan-500 rounded-full border border-white" />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="space-y-2.5">
                          {BIO_CATEGORIES.filter(cat => interestFilter === null || interestFilter === cat.label).map(cat => (
                            <div key={cat.label} className={interestFilter === null ? `rounded-xl border ${cat.color.border} overflow-hidden` : ''}>
                              {interestFilter === null && (
                                <div className={`px-3 py-1.5 ${cat.color.bg}`}>
                                  <span className={`text-[11px] font-black ${cat.color.label}`}>{cat.label}</span>
                                </div>
                              )}
                              <div className={`flex flex-wrap gap-1.5 ${interestFilter === null ? 'p-2.5' : ''}`}>
                                {cat.tags.map(tag => {
                                  const selected = editInterests.includes(tag);
                                  const disabled = !selected && atMax;
                                  return (
                                    <button key={tag} type="button" onClick={() => toggleTag(tag)} disabled={disabled}
                                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all active:scale-95 ${selected ? cat.color.selected : disabled ? (darkMode ? 'bg-slate-700 text-slate-600 border-slate-700 cursor-not-allowed' : 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed') : cat.color.normal}`}>
                                      {tag === '뜨밤' && <span className="mr-1">🔥</span>}{tag}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button onClick={saveInterests} disabled={interestSaving || editInterests.length < 2}
                          className="w-full py-2.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {interestSaving ? '저장 중...' : `관심사 저장 (${editInterests.length}개 선택됨)`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 연락처 설정 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('contact')} className="w-full flex items-center gap-2 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">📋</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>연락처 설정</p>
                        {(statusKakao || statusInstagram || statusPhone) ? (
                          <p className={`text-[11px] leading-snug ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                            {[statusKakao && `K: ${statusKakao}`, statusInstagram && `@${statusInstagram}`, statusPhone && `📞 ${statusPhone}`].filter(Boolean).join(' · ')}
                          </p>
                        ) : (
                          <p className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</p>
                        )}
                      </div>
                      {statusContactPrivate && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full flex-shrink-0">비공개</span>
                      )}
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showContactInEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showContactInEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <div className={`rounded-xl p-3 mb-3 flex items-start gap-2 ${darkMode ? 'bg-amber-900/30 border border-amber-600/40' : 'bg-amber-50 border border-amber-300'}`}>
                          <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠️</span>
                          <p className={`text-[11px] leading-relaxed ${darkMode ? 'text-amber-400' : 'text-amber-700'}`}>연락처는 상대방이 <span className="font-bold">연락처 공유를 수락했을 때만</span> 전달됩니다.</p>
                        </div>
                        <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-3 select-none border ${statusContactPrivate ? (darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200') : (darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200')}`}>
                          <div onClick={() => setStatusContactPrivate(v => !v)}
                            className={`toggle-track relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${statusContactPrivate ? 'bg-red-500' : 'bg-gray-300'}`}>
                            <span className={`toggle-thumb absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${statusContactPrivate ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </div>
                          <div>
                            <p className={`text-xs font-bold ${statusContactPrivate ? (darkMode ? 'text-red-400' : 'text-red-600') : (darkMode ? 'text-slate-300' : 'text-gray-700')}`}>연락처 비공개</p>
                            {statusContactPrivate && <p className={`text-[10px] ${darkMode ? 'text-red-500' : 'text-red-500'}`}>매칭 상대에게 연락처가 전달되지 않습니다</p>}
                          </div>
                        </label>
                        <div className={`space-y-2 transition-opacity ${statusContactPrivate ? 'opacity-40 pointer-events-none' : ''}`}>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-yellow-400">K</div>
                            <input value={statusKakao} onChange={e => setStatusKakao(e.target.value)} placeholder="카카오톡 ID"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-yellow-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-yellow-400'}`} />
                          </div>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-pink-500">@</div>
                            <input value={statusInstagram} onChange={e => setStatusInstagram(e.target.value.replace(/^@/, ''))} placeholder="인스타그램 ID (@제외)"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-pink-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-pink-400'}`} />
                          </div>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-[11px] font-black text-white bg-green-500">📞</div>
                            <input value={statusPhone} onChange={e => setStatusPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="전화번호 (숫자만)" inputMode="tel"
                              className={`w-full pl-10 pr-3 py-2.5 rounded-xl border-2 text-sm focus:outline-none transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder-slate-500 focus:border-green-500' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-green-400'}`} />
                          </div>
                        </div>
                        <button onClick={saveStatusContact} disabled={statusContactSaving}
                          className="mt-3 w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40">
                          {statusContactSaving ? '저장 중...' : '연락처 저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 생월·생일 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('birth')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🔮</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>생월 · 생일</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{hasBd ? `${me.birth_month}월 ${me.birth_day}일` : '미설정 — 사주·운세·궁합에 반영돼요'}</p>
                      </div>
                      {hasBd && <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500 text-white rounded-full flex-shrink-0">{me.birth_month}월 {me.birth_day}일 ✓</span>}
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showBirthEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showBirthEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <div>
                          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>월</p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                              <button key={m} type="button" onClick={() => setSajuBirthMonth(m)}
                                className={`py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                                  sajuBirthMonth === m ? 'bg-purple-500 text-white shadow-sm' :
                                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                                }`}>{m}월</button>
                            ))}
                          </div>
                        </div>
                        <div className="mt-3">
                          <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>일</p>
                          <div className="grid grid-cols-7 gap-1">
                            {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                              <button key={d} type="button" onClick={() => setSajuBirthDay(d)}
                                className={`py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                                  sajuBirthDay === d ? 'bg-purple-500 text-white shadow-sm' :
                                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                                }`}>{d}</button>
                            ))}
                          </div>
                        </div>
                        <button onClick={saveSajuBirthDate} disabled={sajuSaving || sajuBirthMonth === null || sajuBirthDay === null}
                          className="mt-3 w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm disabled:opacity-40 active:scale-[0.98] transition-all">
                          {sajuSaving ? '저장 중...' : '생월·생일 저장하기'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 오늘의 한마디 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('statusMsg')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">💬</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>오늘의 한마디</p>
                        <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{signalStatusMsg.trim() || '미설정'}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showStatusMsgEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showStatusMsgEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        <input type="text" value={signalStatusMsg} onChange={(e) => setSignalStatusMsg(e.target.value.slice(0, 30))}
                          placeholder="예: 퇴근 후 맥주 한잔 같이해요 🍺" maxLength={30}
                          className={`w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-cyan-400 transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder:text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'}`} />
                        <p className={`text-[10px] mt-0.5 mb-3 text-right ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{signalStatusMsg.length}/30</p>
                        <button
                          onClick={async () => {
                            if (!currentUserId || signalSaving) return;
                            setSignalSaving(true);
                            try {
                              const existing = userSignals.find(s => s.user_id === currentUserId);
                              const ideal_msg = [idealTags.join(','), idealFreeText.trim()].filter(Boolean).join('\n') || null;
                              const row = { id: existing?.id ?? crypto.randomUUID(), user_id: currentUserId, status_msg: signalStatusMsg.trim() || null, ideal_msg, created_at: existing?.created_at ?? new Date().toISOString() };
                              await supabase.from('user_signals').upsert(row as never, { onConflict: 'user_id' });
                              // [Fix-6] 저장 완료 후 섹션 자동 닫기
                              setProfileEditSection(null);
                            } catch (e) { console.error('[statusMsg save]', e); }
                            finally { setSignalSaving(false); }
                          }}
                          disabled={signalSaving}
                          className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {signalSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 이상형 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('ideal')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">💘</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>이상형</p>
                        <p className={`text-[11px] truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                          {idealTags.length > 0 ? idealTags.slice(0, 3).join(' · ') + (idealTags.length > 3 ? ' …' : '') : idealFreeText.trim() || '미설정'}
                        </p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showIdealEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showIdealEdit && (
                      <div className={`px-4 pb-4 space-y-3 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {IDEAL_TAG_GROUPS.map(group => (
                          <div key={group.label}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{group.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {group.tags.map(tag => {
                                const selected = idealTags.includes(tag);
                                return (
                                  <button key={tag}
                                    onClick={() => setIdealTags(prev => selected ? prev.filter(t => t !== tag) : [...prev, tag])}
                                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all active:scale-90 ${selected ? 'text-white border-transparent' : darkMode ? 'text-slate-400 border-slate-600 bg-slate-700/50 hover:border-rose-500/50' : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-rose-300'}`}
                                    style={selected ? { background: 'linear-gradient(135deg,#e11d48,#be185d)' } : {}}
                                  >{tag}</button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>기타 ✏️</p>
                          <input type="text" value={idealFreeText} onChange={(e) => setIdealFreeText(e.target.value.slice(0, 30))}
                            placeholder="예: 다정하고 티키타카 잘 맞는 분" maxLength={30}
                            className={`w-full px-3 py-2.5 rounded-xl text-sm border focus:outline-none focus:border-rose-400 transition-colors ${darkMode ? 'bg-slate-700 border-slate-500 text-white placeholder:text-slate-500' : 'bg-gray-50 border-gray-200 text-gray-800 placeholder:text-gray-400'}`} />
                          <p className={`text-[10px] mt-0.5 text-right ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{idealFreeText.length}/30</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!currentUserId || signalSaving) return;
                            setSignalSaving(true);
                            try {
                              const existing = userSignals.find(s => s.user_id === currentUserId);
                              const ideal_msg = [idealTags.join(','), idealFreeText.trim()].filter(Boolean).join('\n') || null;
                              const row = { id: existing?.id ?? crypto.randomUUID(), user_id: currentUserId, status_msg: signalStatusMsg.trim() || null, ideal_msg, created_at: existing?.created_at ?? new Date().toISOString() };
                              await supabase.from('user_signals').upsert(row as never, { onConflict: 'user_id' });
                              // [Fix-6] 저장 완료 후 섹션 자동 닫기
                              setProfileEditSection(null);
                            } catch (e) { console.error('[ideal save]', e); }
                            finally { setSignalSaving(false); }
                          }}
                          disabled={signalSaving}
                          className="w-full py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-sm active:scale-[0.98] transition-all disabled:opacity-40">
                          {signalSaving ? '저장 중...' : '이상형 저장'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── 성향(돔/섭) 공개 ── */}
                  {(() => {
                    const hidePersonality = (me as { hide_personality?: boolean }).hide_personality ?? true;
                    return (
                      <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xl flex-shrink-0">👁</span>
                            <div>
                              <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>성향(돔/섭) 공개</p>
                              <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{hidePersonality ? '🔒 다른 참여자에게 숨김' : '👁 다른 참여자에게 보임'}</p>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              const next = !hidePersonality;
                              if (!currentUserId) return;
                              try {
                                await supabase.from('profiles').update({ hide_personality: next } as never).eq('id', currentUserId);
                                onUpdateProfile({ id: currentUserId, hide_personality: next } as never);
                              } catch (e) { console.error('[hide_personality]', e); }
                            }}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${hidePersonality ? (darkMode ? 'bg-slate-600' : 'bg-gray-300') : 'bg-teal-500'}`}
                            aria-label="성향 공개 토글"
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${hidePersonality ? 'translate-x-1' : 'translate-x-6'}`} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── 차단·숨기기 ── */}
                  <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-gray-100'}`}>
                    <button onClick={() => toggleSection('blocklist')} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                      <span className="text-xl flex-shrink-0">🚫</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>차단·숨기기 목록</p>
                        <p className={`text-[11px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{myBlockList.length > 0 ? `${myBlockList.length}명` : '없음'}</p>
                      </div>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showBlockInEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-gray-400'}`} />
                    </button>
                    {showBlockInEdit && (
                      <div className={`px-4 pb-4 ${darkMode ? 'bg-slate-700/20' : 'bg-gray-50/50'}`}>
                        {myBlockList.length === 0 ? (
                          <p className={`text-xs text-center py-4 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>차단하거나 숨긴 사람이 없어요</p>
                        ) : (
                          <div className="space-y-2">
                            {myBlockList.map(b => {
                              const bp = profiles.find(p => p.id === b.target_id);
                              if (!bp) return null;
                              return (
                                <div key={b.id} className={`flex items-center gap-3 p-2 rounded-xl ${darkMode ? 'bg-slate-700/40' : 'bg-gray-50'}`}>
                                  <img src={bp.photo_url || `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(bp.nickname)}`} alt={bp.nickname}
                                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(bp.nickname)}`; }} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-black truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{bp.nickname}</p>
                                    <p className={`text-[10px] ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>{b.block_type === 'block' ? '🚫 차단됨' : '👻 나를 못 보게 함'}</p>
                                  </div>
                                  {onUnblock && (
                                    <button onClick={() => onUnblock(b.id)}
                                      className={`text-[10px] font-black px-2.5 py-1 rounded-xl border transition-all active:scale-95 flex-shrink-0 ${darkMode ? 'border-slate-500 text-slate-300 hover:bg-slate-600' : 'border-gray-200 text-gray-500 hover:bg-gray-100'}`}
                                    >풀기</button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  </>
                  )}
                </div>
              );
            })()}
          </div>
          </StatusErrorBoundary>
        )}

        {/* ─── 채팅 탭 ─── */}
        {mainTab === 'chats' && (
          <div className="max-w-lg mx-auto space-y-3">
            {/* ── 1:1 / 단체 채팅 전환 서브탭 ── */}
            <div className={`flex rounded-xl p-0.5 ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`}>
              <button
                onClick={() => setChatSubTab('direct')}
                className={`flex-1 py-1.5 text-xs font-black rounded-lg transition-all ${
                  chatSubTab === 'direct'
                    ? (darkMode ? 'bg-slate-600 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : (darkMode ? 'text-slate-400' : 'text-gray-500')
                }`}
              >
                💬 내 채팅 (1:1)
                {Object.values(unreadChatCounts).some(n => n > 0) && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-black bg-rose-500 text-white rounded-full">
                    {Object.values(unreadChatCounts).reduce((a, b) => a + b, 0)}
                  </span>
                )}
              </button>
              {/* 단체채팅 — 준비 중 (코드 유지, UI만 잠금) */}
              <button
                disabled
                className={`flex-1 py-1.5 text-xs font-black rounded-lg cursor-not-allowed opacity-40 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}
              >
                🔒 단체 채팅
              </button>
            </div>

            {/* ── 단체 채팅 목록 ── */}
            {chatSubTab === 'group' && (
              <>
                {groupChats.length === 0 ? (
                  <div className="text-center py-16">
                    <span className="text-5xl block mb-3 opacity-30">👥</span>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                      관심사·나이대 기반 단톡방에 자동 배정됩니다
                    </p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-gray-300'}`}>
                      프로필 bio에 관심사를 적으면 비슷한 사람들과 연결돼요!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupChats.map(group => {
                      const unread = unreadGroupCounts[group.id] ?? 0;
                      return (
                        <div
                          key={group.id}
                          onClick={() => onOpenGroupChat?.(group.id)}
                          className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors duration-300 active:scale-[0.98] ${
                            darkMode ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'
                          }`}
                        >
                          {/* 그룹 아이콘 */}
                          <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-2xl ${
                            darkMode ? 'bg-teal-500/20' : 'bg-teal-50'
                          }`}>
                            👥
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {group.name}
                            </p>
                            <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                              {group.lastMessage || '메시지 없음'}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600'
                            }`}>
                              {group.memberCount ?? 0}명
                            </span>
                            {unread > 0 && (
                              <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── 1:1 채팅 섹션 (기존) ── */}
            {chatSubTab === 'direct' && <>
            {/* ── 닉네임 검색으로 채팅 시작 ── */}
            <div className={`relative rounded-xl border overflow-hidden transition-colors ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="닉네임 · MBTI · 성향 · 초성 검색"
                className={`w-full pl-9 pr-9 py-2.5 text-sm bg-transparent focus:outline-none ${darkMode ? 'text-white placeholder-slate-500' : 'text-gray-900 placeholder-gray-400'}`}
              />
              {chatSearch && (
                <button onClick={() => setChatSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
              )}
            </div>
            {/* 채팅 검색 잠금 토스트 */}
            {chatSearchLockToast && (
              <div className="text-center text-[11px] font-bold text-white bg-gray-800/90 rounded-full px-3 py-1 pointer-events-none">
                🔒 현재 잠금 중
              </div>
            )}
            {/* 검색 결과 */}
            {chatSearch.trim() && (() => {
              const results = profiles.filter(p => p.id !== currentUserId && (
                koreanMatch(p.nickname, chatSearch) ||
                (!!p.mbti && koreanMatch(p.mbti, chatSearch)) ||
                koreanMatch(getPositionLabel(p.personality_score ?? 50), chatSearch)
              ));
              return results.length > 0 ? (
                <div className="space-y-1">
                  {results.map(p => {
                    const hasChat = chatList.some(c => c.user1_id === p.id || c.user2_id === p.id);
                    return (
                      <div key={p.id}
                        onClick={() => { if (functionsLocked) { showChatSearchLockToast(); return; } onOpenChat(p); setChatSearch(''); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700' : 'bg-white hover:bg-gray-50 border border-gray-100'}`}>
                        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                          <img src={getAvatarSrc(p.photo_url, p.nickname)} alt={p.nickname} className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(p.nickname); }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.nickname}</p>
                          {p.mbti && <p className={`text-[10px] ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>{p.mbti}</p>}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${hasChat ? (darkMode ? 'bg-teal-500/20 text-teal-400' : 'bg-teal-50 text-teal-600') : (darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-600')}`}>
                          {hasChat ? '채팅 있음' : '대화 시작 →'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-center text-sm py-3 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>"{chatSearch}" 검색 결과 없음</p>
              );
            })()}
            <div className="flex items-center justify-between">
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>수락한 상대방과의 채팅 내역</p>
              <div className="flex items-center gap-2">
                {chatList.length > 0 && (
                  <button
                    onClick={onDeleteAllChats}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-[11px] font-bold rounded-lg border border-red-200 transition-all active:scale-95"
                  >전체 삭제</button>
                )}
                <RefreshBtn onRefresh={() => doRefresh('chats', onRefreshChat)} refreshed={refreshedTab === 'chats'} />
              </div>
            </div>
            {chatList.length === 0 ? (
              <div className="text-center py-16">
                <MessageCircle className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-slate-500' : 'text-gray-200'}`} />
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>아직 채팅 내역이 없습니다.</p>
              </div>
            ) : (
              chatList.map((chat) => {
                const otherId = chat.user1_id === currentUserId ? chat.user2_id : chat.user1_id;
                const otherProfile = profileMap.get(otherId);
                return (
                  <div key={chat.id}
                    onClick={() => otherProfile && onOpenChat(otherProfile)}
                    className={`rounded-2xl shadow-sm p-4 flex items-center gap-3 cursor-pointer transition-colors duration-300 active:scale-[0.98] ${darkMode ? 'bg-slate-800 border border-slate-600 hover:bg-slate-700' : 'bg-white hover:bg-gray-50'}`}>
                    <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                      {otherProfile ? (
                        <img src={getAvatarSrc(otherProfile.photo_url, otherProfile.nickname)} alt={otherProfile.nickname} className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = genAvatar(otherProfile.nickname); }} />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center text-xs ${darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-400'}`}>?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{otherProfile?.nickname ?? '알 수 없음'}</p>
                      <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                        {(() => {
                          const lm = chat.lastMessage || '';
                          if (lm.startsWith('__contact__')) return '📱 연락처 공유';
                          if (lm.startsWith('__reply__')) return '↩️ ' + lm.replace(/^__reply__[^\n]*\n?/, '').slice(0, 30);
                          return lm || '메시지 없음';
                        })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {(unreadChatCounts[chat.id] ?? 0) > 0 && (
                        <span className="min-w-[22px] h-[22px] px-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-sm">
                          {unreadChatCounts[chat.id] > 99 ? '99+' : unreadChatCounts[chat.id]}
                        </span>
                      )}
                      <button
                        onClick={() => onDeleteChat(chat)}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold rounded-xl border border-red-200 transition-all"
                      >삭제</button>
                    </div>
                  </div>
                );
              })
            )}
            </>}
          </div>
        )}

        {/* ─── 건의함 탭 (관리자에게 요청) ─── */}
        {mainTab === 'suggestions' && (
          <div className="max-w-lg mx-auto space-y-4">
            <div className={`rounded-2xl shadow-sm p-5 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
              <h3 className={`text-base font-black mb-1 ${darkMode ? 'text-white' : 'text-gray-800'}`}>관리자(방장)에게 요청</h3>
              <p className={`text-xs mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>
                익명으로 전송되며, 관리자에게 어느 테이블에서 보냈는지 함께 전달됩니다.
                {tableNumber && <span className="ml-1 font-bold text-teal-600">({tableNumber}번 테이블)</span>}
              </p>

              {reportSent ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-teal-500" />
                  </div>
                  <p className="text-sm font-bold text-teal-700">이미 전달됐습니다!</p>
                  <p className="text-xs text-gray-400 text-center">관리자에게 내용이 전달되었습니다.<br/>추가 건의가 필요하시면 아래 버튼을 눌러주세요.</p>
                  <button onClick={() => setReportSent(false)}
                    className="px-4 py-2 text-xs font-bold text-gray-500 border border-gray-200 rounded-xl hover:border-gray-400 hover:text-gray-700 transition-all">
                    다시 보내기
                  </button>
                </div>
              ) : (
                <>
                  {/* 음료 종류 선택 picker */}
                  {drinkPicker && DRINK_OPTIONS[drinkPicker] && (
                    <div className="mb-4 p-4 bg-cyan-50 border border-cyan-200 rounded-2xl">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-black text-cyan-700">{DRINK_OPTIONS[drinkPicker].label}</p>
                        <button onClick={() => setDrinkPicker(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DRINK_OPTIONS[drinkPicker].choices.map(c => (
                          <button key={c} onClick={() => sendReport(`${drinkPicker} 주세요 (${c})`)}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-bold rounded-xl transition-all active:scale-95">
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick buttons */}
                  {!drinkPicker && (
                    <>
                      {/* 음료 버튼 */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {(['맥주', '소주', '음료수'] as const).map(d => (
                          <button key={d} onClick={() => setDrinkPicker(d)}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold rounded-xl border border-amber-200 hover:border-amber-400 transition-all active:scale-95">
                            {d} 주세요 🍺
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {QUICK_REPORTS.map((r) => (
                          <button key={r.text} onClick={() => sendReport(r.text)}
                            className="px-3 py-2 bg-gray-50 hover:bg-cyan-50 text-gray-700 hover:text-cyan-700 text-xs font-semibold rounded-xl border border-gray-200 hover:border-cyan-300 transition-all active:scale-95">
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {reportError && (
                    <p className="text-xs text-red-500 font-semibold mb-2">{reportError}</p>
                  )}

                  {/* Custom message */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reportText}
                      onChange={e => setReportText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && reportText.trim()) sendReport(reportText); }}
                      placeholder="직접 입력..."
                      maxLength={100}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300"
                    />
                    <button
                      disabled={!reportText.trim()}
                      onClick={() => sendReport(reportText)}
                      className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm"
                    >전송</button>
                  </div>
                </>
              )}
            </div>

            {/* 공식 건의사항 (스타벅스 이벤트) */}
            <details className="group">
              <summary className="list-none flex items-center gap-2 cursor-pointer py-2">
                <ChevronDown className="w-4 h-4 text-amber-500 transition-transform group-open:rotate-180" />
                <span className="text-sm font-bold text-amber-600">공식 건의사항 (채택 시 스타벅스 ☕)</span>
              </summary>
              <div className={`rounded-2xl shadow-sm p-5 mt-2 space-y-3 transition-colors duration-300 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-white'}`}>
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200">
                  채택된 분께는 <span className="font-black">스타벅스 아이스 아메리카노</span>가 지급됩니다!
                </p>
                <textarea value={suggestionContent} onChange={e => setSuggestionContent(e.target.value)}
                  placeholder="앱 개선 건의사항을 작성해주세요..." maxLength={500}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 min-h-[80px]" />
                <div>
                  <input type="text" value={suggestionContact} onChange={e => setSuggestionContact(e.target.value)}
                    placeholder="연락처 (채택 시 선물 발송용)"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <p className="text-[11px] text-red-500 mt-1">※ 본인 연락처가 아닐 경우 지급이 제한될 수 있습니다.</p>
                </div>
                <button disabled={!suggestionContent.trim() || suggestionSubmitting}
                  onClick={async () => { setSuggestionSubmitting(true); await onSubmitSuggestion(suggestionContent, suggestionContact); setSuggestionContent(''); setSuggestionContact(''); setSuggestionSubmitting(false); }}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl disabled:opacity-40 transition-all">
                  {suggestionSubmitting ? '제출 중...' : '건의사항 제출'}
                </button>
                {suggestions.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {suggestions.map(s => (
                      <div key={s.id} className="p-3 bg-gray-50 rounded-xl space-y-1">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-gray-700 flex-1">{s.content}</p>
                          <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            s.status === 'accepted' ? 'bg-teal-100 text-teal-700' : s.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                          }`}>{s.status === 'accepted' ? '채택' : s.status === 'rejected' ? '미채택' : '검토 중'}</span>
                        </div>
                        {s.admin_reason && (
                          <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">관리자: {s.admin_reason}</p>
                        )}
                        {s.admin_response && (
                          <p className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-1.5 rounded-lg font-medium">💬 답변: {s.admin_response}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* ─── 통계 탭 ─── */}
        {mainTab === 'stats' && (
          <StatsTab profiles={profiles} darkMode={darkMode} />
        )}

        {/* ─── 랭킹 탭 ─── */}
        {mainTab === 'ranking' && (
          <RankingTab darkMode={darkMode} profiles={profiles} />
        )}

        {/* ─── 운세 탭 (게임·운세 하위) ─── */}
        {mainTab === 'fortune' && (
          <div className="min-h-[60vh] w-full overflow-x-hidden">
            {/* ── 생월·생일 설정 카드 ── */}
            {currentUserId && (() => {
              const me = profiles.find(p => p.id === currentUserId);
              if (!me) return null;
              const hasBd = !!(me.birth_month && me.birth_day);
              return (
                <div className={`rounded-2xl mb-4 border transition-colors duration-300 ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-gradient-to-br from-purple-50 to-white border-purple-200'}`}>
                  {/* 접기/펼치기 토글 */}
                  <button onClick={() => setShowFortuneBirthEdit(v => !v)} className="w-full flex items-center gap-2 p-4 text-left">
                    <span className="text-xl flex-shrink-0">🔮</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>생월·생일 설정</p>
                      <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-purple-600'}`}>사주·운세·궁합 기능에 필요해요</p>
                    </div>
                    {hasBd ? (
                      <span className="text-[10px] font-black px-2 py-0.5 bg-purple-500 text-white rounded-full flex-shrink-0">
                        {me.birth_month}월 {me.birth_day}일 ✓
                      </span>
                    ) : (
                      <span className={`text-[10px] font-bold flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-gray-400'}`}>미설정</span>
                    )}
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${showFortuneBirthEdit ? 'rotate-180' : ''} ${darkMode ? 'text-slate-400' : 'text-purple-400'}`} />
                  </button>
                  {showFortuneBirthEdit && (
                  <div className="px-4 pb-4">
                  {/* 생월 탭 그리드 */}
                  <div>
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>월</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <button key={m} type="button" onClick={() => setSajuBirthMonth(m)}
                          className={`py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                            sajuBirthMonth === m
                              ? 'bg-purple-500 text-white shadow-sm'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                          }`}>
                          {m}월
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 생일 탭 그리드 */}
                  <div className="mt-3">
                    <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>일</p>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({length: 31}, (_, i) => i + 1).map(d => (
                        <button key={d} type="button" onClick={() => setSajuBirthDay(d)}
                          className={`py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                            sajuBirthDay === d
                              ? 'bg-purple-500 text-white shadow-sm'
                              : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={saveSajuBirthDate}
                    disabled={sajuSaving || (sajuBirthMonth === null || sajuBirthDay === null)}
                    className="mt-3 w-full py-2.5 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white font-bold rounded-xl text-sm disabled:opacity-40 active:scale-[0.98] transition-all">
                    {sajuSaving ? '저장 중...' : '생월·생일 저장하기'}
                  </button>
                </div>
                  )}
                </div>
              );
            })()}
            <Suspense fallback={
              <div className="flex items-center justify-center py-12">
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-400'}`}>🔮 운세 불러오는 중...</span>
              </div>
            }>
              <FortuneTab
                currentUserId={currentUserId}
                myProfile={profiles.find(p => p.id === currentUserId) ?? null}
                profiles={profiles}
                likedIds={likedIds}
                initialCompatProfileId={fortuneCompatTarget}
              />
            </Suspense>
          </div>
        )}

      </main>

      {/* ── MY 버튼 (우하단 고정 원형) + 팝업 ── */}
      {(() => {
        const myTabActive = mainTab === 'status' || mainTab === 'chats' || mainTab === 'fortune' || mainTab === 'settings';
        const heartsBadge = Math.max(0, pendingHeartsCount - seenHeartsCount) + newContactsCount;
        const myBadgeTotal = heartsBadge + newMsgCount;

        const MY_ITEMS: Array<{ id: MainTab; icon: string; label: string; badge?: number }> = [
          { id: 'status',   icon: '💝', label: '내 상태',  badge: heartsBadge },
          { id: 'chats',    icon: '💬', label: '내 채팅',  badge: newMsgCount },
          { id: 'fortune',  icon: '🔮', label: '내 운세' },
          { id: 'settings', icon: '⚙️', label: '내 설정' },
        ];

        return (
          <>
            {/* 팝업 닫기용 배경 */}
            {myMenuOpen && (
              <div className="fixed inset-0 z-40" onClick={() => setMyMenuOpen(false)} />
            )}

            {/* 팝업 메뉴 */}
            {myMenuOpen && (
              <div className={`fixed bottom-24 right-4 z-50 rounded-2xl shadow-2xl border overflow-hidden min-w-[160px] transition-all ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'}`}>
                {MY_ITEMS.map((item, idx) => {
                  const locked = functionsLocked && LOCKED_TABS.has(item.id);
                  const active = mainTab === item.id;
                  return (
                    <button
                      key={item.id}
                      disabled={locked}
                      onClick={() => { if (locked) return; setMyMenuOpen(false); handleTabChange(item.id); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-95 ${idx > 0 ? (darkMode ? 'border-t border-slate-700' : 'border-t border-gray-100') : ''} ${
                        active
                          ? darkMode ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-50 text-cyan-700'
                          : locked
                            ? `opacity-40 cursor-not-allowed ${darkMode ? 'text-slate-400' : 'text-gray-400'}`
                            : darkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg leading-none">{locked ? '🔒' : item.icon}</span>
                      <span className="text-sm font-bold flex-1 text-left">{item.label}</span>
                      {!locked && (item.badge ?? 0) > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* MY 원형 버튼 */}
            <button
              onClick={() => setMyMenuOpen(v => !v)}
              className={`fixed bottom-6 right-4 z-50 w-14 h-14 rounded-full shadow-xl flex flex-col items-center justify-center gap-0 transition-all active:scale-90 select-none ${
                myTabActive || myMenuOpen
                  ? 'bg-gradient-to-br from-cyan-500 to-teal-500 text-white border-2 border-white/40'
                  : darkMode
                    ? 'bg-slate-700 text-slate-200 border-2 border-teal-400/70'
                    : 'bg-white text-gray-700 border-2 border-gray-400'
              }`}
              style={{ boxShadow: (myTabActive || myMenuOpen) ? '0 4px 20px rgba(6,182,212,0.45)' : darkMode ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.15)' }}
            >
              <span className="text-[15px] font-black leading-none tracking-widest">MY</span>
              {myBadgeTotal > 0 && !myMenuOpen && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow-sm">
                  {myBadgeTotal > 99 ? '99+' : myBadgeTotal}
                </span>
              )}
            </button>
          </>
        );
      })()}

    </div>
  );
}
