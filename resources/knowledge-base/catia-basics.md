# CATIA 기본 가이드

## CATIA란?
CATIA(Computer Aided Three-dimensional Interactive Application)는 Dassault Systèmes에서 개발한 PLM(Product Lifecycle Management) 소프트웨어입니다. 항공우주, 자동차, 조선 등 다양한 산업에서 3D 설계에 사용됩니다.

## 시스템 요구사항

### 최소 사양
- **OS**: Windows 10/11 (64-bit)
- **CPU**: Intel Core i7 또는 AMD Ryzen 7 이상
- **RAM**: 16GB 이상 (권장 32GB)
- **GPU**: NVIDIA Quadro 또는 AMD FirePro (OpenGL 4.5 지원)
- **디스크**: SSD 100GB 이상의 여유 공간

### 필수 소프트웨어
- Microsoft Visual C++ Redistributable 2015-2022
- .NET Framework 4.8 이상
- DirectX 11 이상

## CATIA 설치 경로
기본 설치 경로:
- `C:\Program Files\Dassault Systemes\B33`
- `C:\Program Files\Dassault Systemes\CATIA V5`

## 주요 워크벤치

### Part Design
3D 파트 모델링에 사용. 스케치 기반의 솔리드 모델 생성.

주요 기능:
- Pad(돌출), Pocket(절삭), Shaft(회전체)
- Fillet(필렛), Chamfer(챔퍼)
- 패턴(Rectangular, Circular Pattern)

### Assembly Design
여러 파트를 조립하여 어셈블리 구성.

주요 기능:
- Coincidence Constraint(일치 구속)
- Contact Constraint(접촉 구속)
- Offset Constraint(오프셋 구속)

### Drafting
3D 모델로부터 2D 도면 생성.

주요 기능:
- Front View, Top View, Side View 자동 생성
- Dimension 치수 기입
- Section View 단면도

## 자주 발생하는 문제

### 라이선스 오류
**증상**: "License not found" 오류  
**해결**: 
1. 라이선스 서버 IP/호스트명 확인
2. 방화벽에서 포트 27000 허용
3. CATIA 환경변수 `CATLicenseServer` 설정 확인

### GPU 관련 오류
**증상**: 화면이 깨지거나 렌더링 오류  
**해결**:
1. GPU 드라이버 최신 버전으로 업데이트
2. CATIA 호환 인증 GPU 사용 권장
3. `Tools > Options > Display` 에서 Hardware Acceleration 설정 확인
