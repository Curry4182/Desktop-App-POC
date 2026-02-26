# CAD 설계 워크플로우 가이드

## 설계 프로세스 개요

### 1단계: 요구사항 분석
- 설계 목표 및 제약 조건 정의
- 재료 선택 기준 수립
- 허용 공차 결정

### 2단계: 컨셉 설계
- 스케치 작성
- 대략적인 치수 결정
- 대안 검토

### 3단계: 상세 설계 (CATIA 활용)
```
Project/
├── CATPart 파일들 (개별 파트)
├── CATProduct 파일 (어셈블리)
└── CATDrawing 파일들 (도면)
```

### 4단계: 검증
- FEA(유한요소해석) 수행
- 간섭 체크 (Clash Detection)
- BOM(Bill of Materials) 생성

## CATIA Part Design 베스트 프랙티스

### 스케치 원칙
1. **완전 구속(Fully Constrained)**: 모든 스케치 요소를 완전히 구속
2. **대칭 활용**: Symmetry 구속으로 수정 용이성 확보
3. **기준면 활용**: xy, yz, zx 기준면을 기준으로 설계

### 피처 순서
1. Base Feature (Pad/Shaft)
2. Material Removal (Pocket/Groove)
3. Detail Features (Fillet, Chamfer)
4. Patterns (마지막에 적용)

### 파라메트릭 설계
- 치수에 의미 있는 이름 부여 (예: `flange_thickness`, `hole_diameter`)
- Formula를 활용한 치수 간 관계 설정
- Design Table로 변형 관리

## GD&T (기하 공차)

### 주요 공차 기호
| 기호 | 의미 | 적용 |
|------|------|------|
| ⊕ | 위치도 | 홀 패턴 위치 |
| ○ | 진원도 | 원통형 파트 |
| ⊘ | 원통도 | 긴 원통 |
| // | 평행도 | 가공면 |
| ⊥ | 직각도 | 수직면 |

### 기준(Datum) 설정
- A 기준: 주 기능면 (가장 큰 평면)
- B 기준: 2차 기능면
- C 기준: 3차 기능면
