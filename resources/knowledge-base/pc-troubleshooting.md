# CAD 워크스테이션 PC 문제 해결 가이드

## 소프트웨어 미설치 진단

### 확인해야 할 파일 경로 목록

#### CATIA V5
- `C:\Program Files\Dassault Systemes\B33\win_b64\code\bin\CATIA.exe`
- `C:\Program Files\Dassault Systemes\CATIA V5\win_b64\code\bin\CATIA.exe`

#### AutoCAD
- `C:\Program Files\Autodesk\AutoCAD 2024\acad.exe`
- `C:\Program Files\Autodesk\AutoCAD 2023\acad.exe`

#### SolidWorks
- `C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\SLDWORKS.exe`

#### MATLAB
- `C:\Program Files\MATLAB\R2024a\bin\matlab.exe`

### 레지스트리 확인 경로

#### CATIA 설치 확인
```
HKEY_LOCAL_MACHINE\SOFTWARE\Dassault Systemes
HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Dassault Systemes
```

#### AutoCAD 설치 확인
```
HKEY_LOCAL_MACHINE\SOFTWARE\Autodesk\AutoCAD
```

## 네트워크 진단

### 라이선스 서버 연결 확인
CAD 소프트웨어의 네트워크 라이선스를 사용하는 경우:

1. **포트 확인**: 
   - CATIA DSLicensing: TCP 포트 4085
   - FlexLM: TCP/UDP 포트 27000-27009

2. **방화벽 설정**:
   - Windows Defender 방화벽에서 인바운드/아웃바운드 규칙 확인
   - 기업 방화벽의 경우 IT 관리자에게 포트 개방 요청

3. **연결 테스트 명령어**:
   ```cmd
   telnet license-server-ip 27000
   ping license-server-hostname
   ```

## 디스크 용량 관리

### CAD 소프트웨어별 권장 여유 공간
- CATIA V5: 최소 20GB (설치) + 50GB (작업 파일)
- AutoCAD: 최소 10GB (설치) + 20GB (작업 파일)
- SolidWorks: 최소 15GB (설치) + 30GB (작업 파일)

### 임시 파일 위치
- CATIA: `C:\Users\{사용자}\AppData\Local\Temp\CATTemp`
- Windows 임시: `C:\Windows\Temp`

## 성능 최적화

### 가상 메모리 설정
1. 시스템 속성 → 고급 → 성능 설정
2. 가상 메모리: RAM의 1.5~3배 권장
3. SSD에 페이징 파일 위치 권장

### 그래픽 설정
- NVIDIA Control Panel에서 "고성능 NVIDIA 프로세서" 선택
- AMD Radeon 설정에서 "고성능" 모드 선택
