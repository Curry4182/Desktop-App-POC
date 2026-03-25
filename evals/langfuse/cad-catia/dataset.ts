import type { CadCatiaEvalItem } from './types.js'

export const cadCatiaDataset: CadCatiaEvalItem[] = [
  {
    input: {
      id: 'autocad-overview',
      topic: 'cad',
      turns: [
        'AutoCAD는 어떤 CAD 소프트웨어야?',
      ],
    },
    expectedOutput: {
      rubric: 'AutoCAD를 범용 CAD 소프트웨어로 설명하고, 2D 제도나 일반 CAD 작업에 많이 쓰인다는 점이 드러나야 한다.',
      requiredMentions: ['AutoCAD', 'CAD'],
      forbiddenMentions: ['Dassault Systemes가 만든 제품'],
    },
    metadata: {
      scenario: 'autocad-overview',
      tags: ['cad', 'overview'],
    },
  },
  {
    input: {
      id: 'cad-category-company-followup',
      topic: 'cad',
      turns: [
        'AutoCAD는 어떤 CAD 소프트웨어야?',
        '그거 만든 회사가 뭐야?',
      ],
    },
    expectedOutput: {
      rubric: '직전 문맥의 대상은 AutoCAD이므로, AutoCAD를 만든 회사 Autodesk를 답해야 한다.',
      requiredMentions: ['AutoCAD', 'Autodesk'],
      forbiddenMentions: ['Mediterranean Shipping Company', 'Harold Lasswell'],
    },
    metadata: {
      scenario: 'cad-followup-company',
      tags: ['cad', 'follow-up'],
    },
  },
  {
    input: {
      id: 'cad-company-founder-followup',
      topic: 'cad',
      turns: [
        'AutoCAD는 어떤 CAD 소프트웨어야?',
        '그거 만든 회사가 뭐야?',
        '그럼 그 회사의 창립자는?',
      ],
    },
    expectedOutput: {
      rubric: '직전 맥락의 회사는 AutoCAD를 만든 Autodesk이므로 Autodesk 공동 창립자 정보를 줘야 한다.',
      requiredMentions: ['AutoCAD', 'Autodesk', 'John Walker'],
      forbiddenMentions: ['Mediterranean Shipping Company', 'Stephen Hawking'],
    },
    metadata: {
      scenario: 'cad-followup-founder',
      tags: ['cad', 'follow-up', 'founder'],
    },
  },
  {
    input: {
      id: 'autocad-company-country-followup',
      topic: 'cad',
      turns: [
        'AutoCAD는 어떤 CAD 소프트웨어야?',
        '그거 만든 회사가 어느 나라 회사야?',
      ],
    },
    expectedOutput: {
      rubric: 'AutoCAD 제작사는 Autodesk이고, Autodesk는 미국 회사라고 답해야 한다.',
      requiredMentions: ['AutoCAD', 'Autodesk', '미국'],
      forbiddenMentions: ['프랑스 회사'],
    },
    metadata: {
      scenario: 'autocad-company-country',
      tags: ['cad', 'follow-up', 'country'],
    },
  },
  {
    input: {
      id: 'autocad-vs-catia',
      topic: 'cad',
      turns: [
        'AutoCAD와 CATIA 차이를 간단히 설명해줘',
      ],
    },
    expectedOutput: {
      rubric: 'AutoCAD는 범용 2D 제도/일반 CAD에 많이 쓰이고, CATIA는 복잡한 3D 제품 설계와 엔지니어링에 강하다는 대비가 있어야 한다.',
      requiredMentions: ['AutoCAD', 'CATIA'],
      forbiddenMentions: ['둘은 완전히 같은 용도'],
    },
    metadata: {
      scenario: 'autocad-vs-catia',
      tags: ['cad', 'comparison'],
    },
  },
  {
    input: {
      id: 'cad-cam-difference',
      topic: 'cad',
      turns: [
        'CAD와 CAM 차이를 짧게 설명해줘',
      ],
    },
    expectedOutput: {
      rubric: 'CAD는 설계, CAM은 제조/가공 쪽이라는 핵심 구분이 드러나야 한다.',
      requiredMentions: ['CAD', 'CAM'],
      forbiddenMentions: ['두 개념은 완전히 같다'],
    },
    metadata: {
      scenario: 'cad-vs-cam',
      tags: ['cad', 'concept', 'comparison'],
    },
  },
  {
    input: {
      id: 'catia-overview',
      topic: 'catia',
      turns: [
        'CATIA는 어떤 CAD야?',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA를 Dassault Systemes의 고급 3D CAD/CAM/CAE 계열 제품으로 설명하고, 복잡한 제품 설계에 강하다고 말해야 한다.',
      requiredMentions: ['CATIA', 'Dassault', '3D'],
      forbiddenMentions: ['Autodesk가 만든 제품'],
    },
    metadata: {
      scenario: 'catia-overview',
      tags: ['catia', 'overview'],
    },
  },
  {
    input: {
      id: 'catia-company-country-followup',
      topic: 'catia',
      turns: [
        'CATIA를 만든 회사는 어디야?',
        '그 회사는 어느 나라 회사야?',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA 제작사는 Dassault Systemes이고, 그 회사는 프랑스 회사라고 답해야 한다.',
      requiredMentions: ['Dassault', '프랑스'],
      forbiddenMentions: ['미국 회사'],
    },
    metadata: {
      scenario: 'catia-company-country',
      tags: ['catia', 'follow-up', 'country'],
    },
  },
  {
    input: {
      id: 'catia-industry-strengths',
      topic: 'catia',
      turns: [
        'CATIA가 특히 강한 산업 분야를 2개만 알려줘',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA가 복잡한 제품 설계에 강하다는 맥락에서 항공우주와 자동차 같은 분야를 답하는 것이 바람직하다.',
      requiredMentions: ['CATIA'],
      forbiddenMentions: ['회계 소프트웨어'],
    },
    metadata: {
      scenario: 'catia-industry-strengths',
      tags: ['catia', 'industry'],
    },
  },
  {
    input: {
      id: 'catia-maker-followup',
      topic: 'catia',
      turns: [
        'CATIA는 어떤 CAD야?',
        '그거 만든 회사가 뭐야?',
      ],
    },
    expectedOutput: {
      rubric: '직전 문맥의 대상은 CATIA이므로 제작사는 Dassault Systemes라고 답해야 한다.',
      requiredMentions: ['CATIA', 'Dassault'],
      forbiddenMentions: ['Autodesk'],
    },
    metadata: {
      scenario: 'catia-followup-company',
      tags: ['catia', 'follow-up'],
    },
  },
  {
    input: {
      id: 'catia-maker-country-comparison',
      topic: 'catia',
      turns: [
        'CATIA를 만든 회사와 AutoCAD를 만든 회사의 나라를 비교해줘',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA 쪽은 Dassault Systemes / 프랑스, AutoCAD 쪽은 Autodesk / 미국의 비교가 나와야 한다.',
      requiredMentions: ['CATIA', 'Dassault', '프랑스', 'AutoCAD', 'Autodesk', '미국'],
      forbiddenMentions: ['둘 다 프랑스 회사', '둘 다 미국 회사'],
    },
    metadata: {
      scenario: 'catia-autocad-country-comparison',
      tags: ['catia', 'cad', 'multi-hop', 'comparison'],
    },
  },
  {
    input: {
      id: 'catia-solidworks-relationship',
      topic: 'catia',
      turns: [
        'CATIA와 SolidWorks는 어떤 관계가 있어?',
      ],
    },
    expectedOutput: {
      rubric: '둘 다 Dassault Systemes 계열 CAD 제품이라는 점이나, 제품 포지션 차이가 드러나야 한다.',
      requiredMentions: ['CATIA', 'SolidWorks', 'Dassault'],
      forbiddenMentions: ['아예 무관한 회사 제품'],
    },
    metadata: {
      scenario: 'catia-solidworks-relationship',
      tags: ['catia', 'relationship', 'comparison'],
    },
  },
  {
    input: {
      id: 'catia-vs-autocad',
      topic: 'catia',
      turns: [
        'CATIA와 AutoCAD 차이를 간단히 설명해줘',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA는 복잡한 3D 제품 설계/엔지니어링에 강하고, AutoCAD는 범용 2D 제도와 일반 CAD 업무에 많이 쓰인다는 대비가 있어야 한다.',
      requiredMentions: ['CATIA', 'AutoCAD'],
      forbiddenMentions: ['둘은 완전히 같은 용도'],
    },
    metadata: {
      scenario: 'catia-vs-autocad',
      tags: ['catia', 'comparison'],
    },
  },
  {
    input: {
      id: 'catia-broad-summary',
      topic: 'catia',
      turns: [
        'CATIA에 대해 한 문단으로 소개해줘',
      ],
    },
    expectedOutput: {
      rubric: 'CATIA를 Dassault Systemes의 고급 3D CAD/CAM/CAE 제품으로 소개하고, 복잡한 산업 제품 설계에 강하다는 점이 포함되어야 한다.',
      requiredMentions: ['CATIA', 'Dassault'],
      forbiddenMentions: ['무료 오픈소스 CAD'],
    },
    metadata: {
      scenario: 'catia-broad-summary',
      tags: ['catia', 'overview', 'broad'],
    },
  },
]
