import { motion } from 'framer-motion'
import styles from './AgentProgress.module.css'

const AGENTS = [
  { id: 1, name: 'Agente Analista', desc: 'Detecta errores y fortalezas' },
  { id: 2, name: 'Agente Tasador', desc: 'Evalua estrategia de precio' },
  { id: 3, name: 'Agente Copywriter', desc: 'Genera texto optimizado' },
  { id: 4, name: 'Agente Orquestador', desc: 'Consolida el informe final' },
]

export default function AgentProgress({ message }) {
  const activeAgent = AGENTS.findIndex(a =>
    message?.toLowerCase().includes(`agente ${a.id}`)
  )

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
    >
      <div className={styles.header}>
        <div className={styles.pulse} />
        <span className={styles.title}>Sistema multi-agente activo</span>
      </div>

      <p className={styles.message}>{message || 'Iniciando...'}</p>

      <div className={styles.agents}>
        {AGENTS.map((agent, i) => {
          const isDone = activeAgent > i
          const isActive = activeAgent === i
          const isPending = activeAgent < i

          return (
            <motion.div
              key={agent.id}
              className={`${styles.agent} ${isActive ? styles.active : ''} ${isDone ? styles.done : ''}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className={styles.agentIcon}>
                {isDone ? '\u2713' : isActive ? <span className={styles.spinnerSmall} /> : agent.id}
              </div>
              <div className={styles.agentInfo}>
                <div className={styles.agentName}>{agent.name}</div>
                <div className={styles.agentDesc}>{agent.desc}</div>
              </div>
              {isActive && (
                <motion.div
                  className={styles.activeDot}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                />
              )}
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
