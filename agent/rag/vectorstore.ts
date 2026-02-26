import { MemoryVectorStore } from 'langchain/vectorstores/memory'
import { OpenAIEmbeddings } from '@langchain/openai'
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory'
import { TextLoader } from 'langchain/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let vectorStoreInstance: MemoryVectorStore | null = null

/**
 * 임베딩 생성 - 현재는 OpenAI, 환경변수로 전환 가능
 */
function createEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: process.env.OPENAI_API_KEY,
  })
}

/**
 * 지식베이스 Markdown 문서 로드 및 분할
 */
async function loadDocuments() {
  const knowledgePath =
    process.env.KNOWLEDGE_BASE_PATH ||
    path.resolve(__dirname, '../../resources/knowledge-base')

  const loader = new DirectoryLoader(knowledgePath, {
    '.md': (filePath: string) => new TextLoader(filePath),
  })

  const docs = await loader.load()

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
    separators: ['\n## ', '\n### ', '\n\n', '\n', ' '],
  })

  return splitter.splitDocuments(docs)
}

/**
 * 벡터 스토어 싱글톤 - 앱 시작 시 1회 초기화
 */
export async function getVectorStore(): Promise<MemoryVectorStore> {
  if (vectorStoreInstance) return vectorStoreInstance

  const docs = await loadDocuments()
  const embeddings = createEmbeddings()

  vectorStoreInstance = await MemoryVectorStore.fromDocuments(docs, embeddings)
  console.log(`[RAG] 벡터 스토어에 문서 청크 ${docs.length}개 로드 완료`)

  return vectorStoreInstance
}

/**
 * 벡터 스토어 강제 재초기화 (문서 업데이트 시)
 */
export async function reinitializeVectorStore(): Promise<MemoryVectorStore> {
  vectorStoreInstance = null
  return getVectorStore()
}
