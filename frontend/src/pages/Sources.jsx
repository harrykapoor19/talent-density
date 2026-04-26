import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import { Play, Sparkles, ScanSearch, Plus, Server, Rss, Brain, Globe, Database, Timer, Search, ChevronDown } from 'lucide-react'

function ResultSummary({ result, onRunWorkflow, workflowRunning, workflowResult }) {
  if (!result) return null
  if (result.error) return (
    <div className="mt-2.5 text-caption text-red-600 bg-red-50 rounded-md p-2.5">Error: {result.error}</div>
  )

  const added = result.added || []
  const alreadyKnown = result.already_known || []
  const companiesFound = result.companies_found || []

  if ('companies_found' in result) {
    return (
      <div className="mt-2.5 space-y-1.5 animate-fade-in">
        <div className="text-body text-fg">
          Found <strong>{companiesFound.length}</strong> {companiesFound.length === 1 ? 'company' : 'companies'}.
          {added.length > 0 && <> Added <strong>{added.length}</strong> new: {added.join(', ')}.</>}
          {alreadyKnown.length > 0 && <> Already tracking: {alreadyKnown.join(', ')}.</>}
        </div>
        {added.length > 0 && !workflowResult && (
          <button
            className="btn-primary btn-sm"
            onClick={() => onRunWorkflow(added)}
            disabled={workflowRunning}
          >
            {workflowRunning ? <Spinner size={12} /> : <Play size={12} />}
            {workflowRunning ? 'Running...' : `Run workflow for ${added.length} ${added.length === 1 ? 'company' : 'companies'}`}
          </button>
        )}
        {workflowResult && <WorkflowResult result={workflowResult} />}
      </div>
    )
  }

  if ('companies' in result) {
    const companies = result.companies || []
    return (
      <div className="mt-2.5 space-y-1.5 animate-fade-in">
        <div className="text-body text-fg">
          Found <strong>{companies.length}</strong> {companies.length === 1 ? 'company' : 'companies'} from TechCrunch and Next Play.
        </div>
        {companies.length > 0 && (
          <div className="text-caption text-fg-secondary">{companies.join(', ')}</div>
        )}
        {companies.length > 0 && !workflowResult && (
          <button
            className="btn-primary btn-sm"
            onClick={() => onRunWorkflow(companies)}
            disabled={workflowRunning}
          >
            {workflowRunning ? <Spinner size={12} /> : <Play size={12} />}
            {workflowRunning ? 'Running...' : `Run workflow for ${companies.length} companies`}
          </button>
        )}
        {workflowResult && <WorkflowResult result={workflowResult} />}
      </div>
    )
  }

  return null
}

function AddResult({ result }) {
  if (!result) return null
  if (result.error) return (
    <div className="mt-2.5 text-caption text-red-600 bg-red-50 rounded-md p-2.5">Error: {result.error}</div>
  )

  const jobsAdded = result.jobs_added || []
  const jobsFailed = result.jobs_failed || []
  const workflow = result.workflow

  return (
    <div className="mt-2.5 space-y-1.5 animate-fade-in">
      {jobsAdded.length > 0 && (
        <div className="text-body text-fg">Added {jobsAdded.length} {jobsAdded.length === 1 ? 'job' : 'jobs'} to Open Roles: {jobsAdded.join(', ')}.</div>
      )}
      {jobsFailed.length > 0 && (
        <div className="text-body text-red-500">Failed: {jobsFailed.join(', ')}.</div>
      )}
      {workflow && <WorkflowResult result={workflow} />}
      {!workflow && (result.companies_added || []).length === 0 && (result.companies_existing || []).length === 0 && jobsAdded.length === 0 && (
        <div className="text-body text-fg-muted">Nothing new to add.</div>
      )}
    </div>
  )
}

function WorkflowResult({ result }) {
  if (!result) return null
  if (result.error) return (
    <div className="text-caption text-red-600 bg-red-50 rounded-md p-2.5">Error: {result.error}</div>
  )

  const openRoles = result.open_roles || result.jobs_found || []
  const addedToRadar = result.radar_added || result.added_to_radar || []
  const skipped = result.skipped || []
  const total = openRoles.length + addedToRadar.length + skipped.length

  return (
    <div className="text-body text-fg bg-surface-secondary rounded-md p-2.5 space-y-1 animate-fade-in">
      {openRoles.length > 0 && <div>Found <strong>{openRoles.length}</strong> open {openRoles.length === 1 ? 'role' : 'roles'}, added to Open Roles.</div>}
      {addedToRadar.length > 0 && <div>Added <strong>{addedToRadar.length}</strong> {addedToRadar.length === 1 ? 'company' : 'companies'} to On Radar: {addedToRadar.map(c => c.company || c).join(', ')}.</div>}
      {skipped.length > 0 && <div className="text-fg-muted">Skipped {skipped.length} (low relevance).</div>}
      {total === 0 && <div className="text-fg-secondary">Workflow complete, no new roles or companies found.</div>}
    </div>
  )
}

export default function Sources() {
  const [running, setRunning] = useState(false)
  const [runLog, setRunLog] = useState(null)

  const [postText, setPostText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [extractWorkflowRunning, setExtractWorkflowRunning] = useState(false)
  const [extractWorkflowResult, setExtractWorkflowResult] = useState(null)

  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addResult, setAddResult] = useState(null)

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [scanWorkflowRunning, setScanWorkflowRunning] = useState(false)
  const [scanWorkflowResult, setScanWorkflowResult] = useState(null)

  const toast = useToast()

  const runPipeline = async () => {
    setRunning(true)
    setRunLog(null)
    try {
      const resp = await apiFetch('/api/pipeline/run', { method: 'POST' })
      const data = await resp.json()
      setRunLog(data)
      toast('Pipeline run complete', 'success')
    } catch (e) {
      setRunLog({ error: e.message })
      toast('Pipeline run failed', 'error')
    }
    setRunning(false)
  }

  const extractFromPost = async () => {
    if (!postText.trim()) return
    setExtracting(true)
    setExtractResult(null)
    setExtractWorkflowResult(null)
    try {
      const resp = await apiFetch('/api/sources/extract-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: postText }),
      })
      setExtractResult(await resp.json())
      toast('Companies extracted', 'success')
    } catch (e) {
      setExtractResult({ error: e.message })
      toast('Extraction failed', 'error')
    }
    setExtracting(false)
  }

  const pollForResult = async (jobId, setResult, setRunning) => {
    const poll = async () => {
      try {
        const resp = await apiFetch(`/api/pipeline/status/${jobId}`)
        const data = await resp.json()
        if (data.status === 'done') {
          setResult(data.result)
          setRunning(false)
        } else if (data.status === 'error') {
          setResult(data.result)
          setRunning(false)
        } else {
          setTimeout(poll, 3000)
        }
      } catch {
        setTimeout(poll, 3000)
      }
    }
    setTimeout(poll, 3000)
  }

  const runWorkflowForExtracted = async (companies) => {
    setExtractWorkflowRunning(true)
    setExtractWorkflowResult(null)
    try {
      const resp = await apiFetch('/api/pipeline/run-for-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies }),
      })
      const data = await resp.json()
      if (data.job_id) {
        pollForResult(data.job_id, setExtractWorkflowResult, setExtractWorkflowRunning)
      } else {
        setExtractWorkflowResult(data)
        setExtractWorkflowRunning(false)
      }
    } catch (e) {
      setExtractWorkflowResult({ error: e.message })
      setExtractWorkflowRunning(false)
    }
  }

  const runFundingScan = async () => {
    setScanning(true)
    setScanResult(null)
    setScanWorkflowResult(null)
    try {
      const resp = await apiFetch('/api/sources/funding-scan', { method: 'POST' })
      const data = await resp.json()
      if (data.job_id) {
        const poll = async () => {
          try {
            const r = await apiFetch(`/api/sources/funding-scan/status/${data.job_id}`)
            const status = await r.json()
            if (status.status === 'done') {
              setScanResult(status.result)
              setScanning(false)
              toast('Funding scan complete', 'success')
            } else if (status.status === 'error') {
              setScanResult(status.result)
              setScanning(false)
            } else {
              setTimeout(poll, 3000)
            }
          } catch { setTimeout(poll, 3000) }
        }
        setTimeout(poll, 3000)
      } else {
        setScanResult(data)
        setScanning(false)
      }
    } catch (e) {
      setScanResult({ error: e.message })
      setScanning(false)
    }
  }

  const runWorkflowForScan = async (companies) => {
    setScanWorkflowRunning(true)
    setScanWorkflowResult(null)
    try {
      const resp = await apiFetch('/api/pipeline/run-for-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies }),
      })
      const data = await resp.json()
      if (data.job_id) {
        pollForResult(data.job_id, setScanWorkflowResult, setScanWorkflowRunning)
      } else {
        setScanWorkflowResult(data)
        setScanWorkflowRunning(false)
      }
    } catch (e) {
      setScanWorkflowResult({ error: e.message })
      setScanWorkflowRunning(false)
    }
  }

  const addCompanies = async () => {
    if (!addInput.trim()) return
    setAdding(true)
    setAddResult(null)
    try {
      const resp = await apiFetch('/api/sources/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: addInput }),
      })
      setAddResult(await resp.json())
      toast('Items added', 'success')
    } catch (e) {
      setAddResult({ error: e.message })
      toast('Failed to add', 'error')
    }
    setAdding(false)
  }

  return (
    <div className="space-y-6">

      {/* Run pipeline */}
      <div className="card p-3.5 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-body font-medium text-fg">Run Full Pipeline</div>
          <div className="text-caption text-fg-muted mt-0.5">Manually trigger the weekly agent run. Polls all 100+ tracked companies on Ashby and Greenhouse, scores new jobs with Claude, and updates Open Roles and On Radar.</div>
        </div>
        <button className="btn-primary" onClick={runPipeline} disabled={running}>
          {running ? <Spinner size={16} /> : <Play size={16} />}
          {running ? 'Running...' : 'Run Pipeline'}
        </button>
      </div>
      {runLog && (
        <div className="card p-3.5 text-caption font-mono text-fg-secondary bg-surface-secondary whitespace-pre-wrap max-h-48 overflow-y-auto animate-fade-in">
          {runLog.stdout || JSON.stringify(runLog, null, 2)}
        </div>
      )}

      <hr className="border-border-subtle" />

      {/* Add from post text */}
      <div className="card p-3.5">
        <div className="text-body font-medium text-fg mb-1">Add from post text</div>
        <div className="text-caption text-fg-muted mb-2.5">Paste a LinkedIn post listing companies</div>
        <textarea
          value={postText}
          onChange={e => setPostText(e.target.value)}
          rows={4}
          placeholder={'Back with another list of startups hiring...\n\n\u2022 Acme AI \u2014 $50M Series B\n\u2022 Notion \u2014 hiring PM'}
          className="w-full border border-border rounded-md px-3 py-2 text-body text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
        />
        <button className="btn-primary btn-sm mt-1.5" onClick={extractFromPost} disabled={extracting || !postText.trim()}>
          {extracting ? <Spinner size={12} /> : <Sparkles size={12} />}
          {extracting ? 'Extracting...' : 'Extract and add companies'}
        </button>
        <ResultSummary
          result={extractResult}
          onRunWorkflow={runWorkflowForExtracted}
          workflowRunning={extractWorkflowRunning}
          workflowResult={extractWorkflowResult}
        />
      </div>

      {/* Auto-scan funding news */}
      <div className="card p-3.5">
        <div className="text-body font-medium text-fg mb-1">Auto-scan funding news</div>
        <div className="text-caption text-fg-muted mb-2.5">
          Pulls from Next Play newsletter and TechCrunch. Extracts companies, then lets you run the workflow.
        </div>
        <button className="btn-primary btn-sm" onClick={runFundingScan} disabled={scanning}>
          {scanning ? <Spinner size={12} /> : <ScanSearch size={12} />}
          {scanning ? 'Scanning...' : 'Run funding scan'}
        </button>
        <ResultSummary
          result={scanResult}
          onRunWorkflow={runWorkflowForScan}
          workflowRunning={scanWorkflowRunning}
          workflowResult={scanWorkflowResult}
        />
      </div>

      {/* Add anything */}
      <div className="card p-3.5">
        <div className="text-body font-medium text-fg mb-1">Add anything</div>
        <div className="text-caption text-fg-muted mb-2.5">
          Company names or job links. Mix and match.
        </div>
        <textarea
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          rows={4}
          placeholder={'Granola\nNotion AI\nhttps://jobs.ashby.com/somecompany/senior-pm'}
          className="w-full border border-border rounded-md px-3 py-2 text-body text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none"
        />
        <button className="btn-primary btn-sm mt-1.5" onClick={addCompanies} disabled={adding || !addInput.trim()}>
          {adding ? <Spinner size={12} /> : <Plus size={12} />}
          {adding ? 'Adding...' : 'Add to dashboard'}
        </button>
        <AddResult result={addResult} />
      </div>

      <hr className="border-border-subtle" />

      {/* Connected systems */}
      <div>
        <h3 className="text-body font-medium text-fg mb-3">Connected systems</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Server size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">Job boards</span>
            </div>
            <div><span className="text-body font-normal text-fg">Ashby</span> <span className="text-fg-muted text-caption">· 50+ verified company slugs</span></div>
            <div><span className="text-body font-normal text-fg">Greenhouse</span> <span className="text-fg-muted text-caption">· 10+ verified company slugs</span></div>
            <div><span className="text-body font-normal text-fg">Work at a Startup</span> <span className="text-fg-muted text-caption">· YC company list via Apify</span></div>
            <div className="text-caption text-fg-muted pt-1">Polled every Monday 9am PT</div>
          </div>

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Rss size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">Funding signals</span>
            </div>
            <div><span className="text-body font-normal text-fg">TechCrunch</span> <span className="text-fg-muted text-caption">· RSS feed</span></div>
            <div><span className="text-body font-normal text-fg">Next Play newsletter</span> <span className="text-fg-muted text-caption">· RSS feed</span></div>
            <div className="text-caption text-fg-muted pt-1">Scanned every Monday 9:05am PT</div>
          </div>

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">AI systems</span>
            </div>
            <div><span className="text-body font-normal text-fg">Claude Haiku</span> <span className="text-fg-muted text-caption">· role scoring</span></div>
            <div><span className="text-body font-normal text-fg">Claude Sonnet</span> <span className="text-fg-muted text-caption">· company scoring + outreach drafts</span></div>
          </div>

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Globe size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">LinkedIn</span>
            </div>
            <div><span className="text-body font-normal text-fg">Job board</span> <span className="text-fg-muted text-caption">· open roles via Apify</span></div>
            <div><span className="text-body font-normal text-fg">Curator monitor</span> <span className="text-fg-muted text-caption">· accounts posting funded startup lists</span></div>
            <div className="text-caption text-fg-muted pt-1">Monday + Thursday 9:10am PT</div>
          </div>

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Database size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">Database</span>
            </div>
            <div><span className="text-body font-normal text-fg">Supabase (Postgres)</span></div>
            <div className="text-caption text-fg-muted">Tables: jobs · companies · signals</div>
            <div className="text-caption text-fg-muted">Stores: scores, drafts, behavioral signals, application history</div>
          </div>

          <div className="card p-3.5 space-y-1">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Timer size={12} className="text-fg-muted" />
              <span className="text-caption font-medium text-fg-secondary uppercase tracking-wider">Scheduler</span>
            </div>
            <div><span className="text-body font-normal text-fg">APScheduler via launchd</span></div>
            <div className="text-caption text-fg-muted">Mon 9:00am · Job board polling</div>
            <div className="text-caption text-fg-muted">Mon 9:05am · RSS scan</div>
            <div className="text-caption text-fg-muted">Mon+Thu 9:10am · LinkedIn monitor</div>
            <div className="text-caption text-fg-muted">Mon 10:00am · Monday brief</div>
          </div>

        </div>
      </div>

    </div>
  )
}
