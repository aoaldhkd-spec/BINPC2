import { maxAdultBirthYear, minBirthYearForEventMaxAge } from './korean-age';

export function buildDecadeGroups(now: Date = new Date()): Record<string, number[]> {
  const maxYear = maxAdultBirthYear(now);
  const minYear = minBirthYearForEventMaxAge(now);
  const inRange = (y: number) => y >= minYear && y <= maxYear;
  // 80년대 선택지는 00년대 탭 안에서 89·88이하 버킷만 제공한다.
  // 행사 상한(minYear)과 무관하게 이 두 연도는 명시적으로 허용한다.
  const relocated80s = [1989, 1988].filter(y => y <= maxYear);
  const groups: Record<string, number[]> = {
    '90년대': Array.from({ length: 10 }, (_, i) => 1990 + i).filter(inRange),
    '00년대': [...relocated80s, ...Array.from({ length: 10 }, (_, i) => 2000 + i).filter(inRange)],
  };
  return Object.fromEntries(Object.entries(groups).filter(([, years]) => years.length > 0));
}

export const DECADE_GROUPS = buildDecadeGroups();

export const LOCATION_GROUPS: Record<string, string[]> = {
  '광역시': ['부산', '서울', '인천', '대구', '울산', '대전', '광주', '세종'],
  '경기': ['수원', '성남', '용인', '고양', '부천', '안산', '화성', '남양주', '평택', '안양', '의정부', '파주'],
  '경남': ['창원', '김해', '양산', '거제', '진주', '통영', '밀양', '사천', '고성', '남해', '하동', '산청', '함양', '거창', '합천'],
  '경북': ['포항', '구미', '경산', '경주', '안동', '김천', '영주', '문경', '상주', '칠곡'],
  '전북': ['전주', '익산', '군산', '정읍', '남원', '김제', '완주'],
  '전남': ['순천', '여수', '광양', '목포', '나주', '담양', '고흥'],
  '충남': ['천안', '아산', '공주', '논산', '서산', '당진', '계룡'],
  '충북': ['청주', '충주', '제천', '음성', '진천'],
  '강원': ['춘천', '원주', '강릉', '속초', '동해', '삼척', '횡성'],
  '기타': ['제주', '해외'],
};

