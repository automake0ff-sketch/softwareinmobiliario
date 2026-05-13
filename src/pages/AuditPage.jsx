import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { runAuditAgents } from '../agents/auditAgents'
import AuditForm from '../components/AuditForm'
import AuditResults from '../components/AuditResults'
import AgentProgress from '../components/AgentProgress'
import styles from './AuditPage.module.css'

export default function AuditPage() {
  const [loading, setLoading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const { canAudit, incrementUsage, addToHistory, currentResult, setCurrentResult, clearResult, plan } = useStore()

  const envKey = import.meta.env.VITE_OPENROUTER_API_KEY || ''

  const handleAudit = async (formData) => {
    if (!envKey || envKey === 'sk-or-v1-TU_API_KEY_AQUI') {
      toast.error('Configura VITE_OPENROUTER_API_KEY en tu archivo .env')
      return
    }
    if (!canAudit()) {
      toast.error('Has alcanzado el limite gratuito. Activa Pro para continuar.')
      return
    }

    setLoading(true)
    clearResult()

    try {
      const result = await runAuditAgents(formData, setProgressMsg)
      setCurrentResult(result)
      incrementUsage()
      addToHistory({
        id: Date.now(),
        titulo: formData.titulo,
        ubicacion: formData.ubicacion || '',
        score: result.score_general,
        fecha: new Date().toISOString(),
        result,
      })
      toast.success('Auditoria completada')
    } catch (err) {
      toast.error(err.message || 'Error al conectar con la IA. Revisa tu API key.')
      console.error(err)
    } finally {
      setLoading(false)
      setProgressMsg('')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.left}>
          <AnimatePresence mode="wait">
            {!currentResult && !loading && (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className={styles.header}>
                  <span className={styles.eyebrow}>Sistema multi-agente \u00b7 OpenRouter</span>
                  <h1 className={styles.headline}>
                    Audita tu anuncio.<br />
                    <em>Vende antes.</em>
                  </h1>
                  <p className={styles.sub}>
                    4 agentes de IA analizan tu anuncio en paralelo: detectan errores,
                    optimizan el texto, evaluan el precio y generan un plan de accion.
                  </p>
                </div>
                <AuditForm
                  onSubmit={handleAudit}
                  loading={loading}
                  disabled={!canAudit()}
                />
              </motion.div>
            )}

            {loading && (
              <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <AgentProgress message={progressMsg} />
              </motion.div>
            )}

            {currentResult && !loading && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <AuditResults
                  result={currentResult}
                  onReset={clearResult}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!currentResult && !loading && (
          <motion.div
            className={styles.sidebar}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔍</div>
              <h3>Analisis de 4 agentes IA</h3>
              <p>Analista, copywriter, tasador y orquestador trabajan juntos para darte el diagnostico mas completo.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>✍️</div>
              <h3>Descripcion lista para publicar</h3>
              <p>Texto optimizado para conversion, listo para copiar y pegar en Idealista o Fotocasa.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>💰</div>
              <h3>Estrategia de precio</h3>
              <p>Rango recomendado, precio psicologico y tiempo estimado de venta segun el mercado actual.</p>
            </div>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📄</div>
              <h3>Informe PDF descargable</h3>
              <p>Informe completo en PDF para compartir con el propietario o tu equipo.</p>
            </div>

            <div className={styles.testimonial}>
              <div className={styles.stars}>★★★★★</div>
              <p>"Subi el score de 48 a 81 en 10 minutos. El anuncio empozo a recibir llamadas ese mismo dia."</p>
              <div className={styles.testimonialAuthor}>— Agencia RE/MAX, Sevilla</div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
