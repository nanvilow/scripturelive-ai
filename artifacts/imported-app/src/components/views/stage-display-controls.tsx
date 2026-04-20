'use client'

import { useState } from 'react'
import { useAppStore, type Slide } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Timer, Plus, X, Megaphone } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Operator-side controls that drive the stage-display window.
 *
 * Surfaces three of the most-requested live-production toys that
 * Logos / ProPresenter operators expect:
 *   1. A countdown timer (HH:MM until the next thing happens) — the
 *      stage display ticks it down so the speaker can pace themselves.
 *   2. A speaker-notes panel — typed once, mirrored to the stage view.
 *   3. A one-click "Add announcement slide" so the operator can drop
 *      a quick text card onto the slide deck without opening the
 *      full slide composer.
 *
 * Everything writes through Zustand → OutputBroadcaster → SSE.
 */
export function StageDisplayControls() {
  const {
    countdownEndAt, setCountdown,
    sermonNotes, setSermonNotes,
    slides, setSlides, setLiveSlideIndex,
  } = useAppStore()

  const [minutes, setMinutes] = useState('5')
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')

  const startCountdown = () => {
    const m = parseFloat(minutes)
    if (!m || m <= 0) {
      toast.error('Enter a positive number of minutes')
      return
    }
    setCountdown(Date.now() + m * 60_000)
    toast.success(`Countdown started: ${m} min`)
  }

  const stopCountdown = () => {
    setCountdown(null)
  }

  const addAnnouncement = (goLive: boolean) => {
    if (!annTitle.trim() && !annBody.trim()) {
      toast.error('Add a title or body for the announcement')
      return
    }
    const slide: Slide = {
      id: `announcement-${Date.now()}`,
      type: 'announcement',
      title: annTitle.trim() || 'Announcement',
      subtitle: '',
      content: annBody.split('\n').filter((l) => l.trim().length > 0),
    }
    const newIndex = slides.length
    setSlides([...slides, slide])
    if (goLive) setLiveSlideIndex(newIndex)
    setAnnTitle('')
    setAnnBody('')
    toast.success(goLive ? 'Announcement on air' : 'Announcement added to deck')
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <div>
        <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
          <Timer className="h-3.5 w-3.5 text-amber-400" /> Stage Countdown Timer
        </Label>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            min="0.5"
            step="0.5"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-8 w-20 text-xs"
          />
          <span className="text-xs text-muted-foreground">min</span>
          <Button size="sm" className="h-8 text-xs gap-1" onClick={startCountdown}>
            <Timer className="h-3 w-3" /> Start
          </Button>
          {countdownEndAt && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={stopCountdown}>
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
          {countdownEndAt && (
            <span className="text-[11px] text-amber-300 ml-1">
              Ends {new Date(countdownEndAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium mb-2 block">Speaker Notes (stage view only)</Label>
        <Textarea
          value={sermonNotes}
          onChange={(e) => setSermonNotes(e.target.value)}
          placeholder="Sermon points, transition cues, prayer reminders…"
          className="min-h-[64px] text-xs"
        />
      </div>

      <div>
        <Label className="text-xs font-medium flex items-center gap-1.5 mb-2">
          <Megaphone className="h-3.5 w-3.5 text-emerald-400" /> Quick Announcement Slide
        </Label>
        <div className="space-y-2">
          <Input
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="Title (e.g. Welcome / Offering / Next Service)"
            className="h-8 text-xs"
          />
          <Textarea
            value={annBody}
            onChange={(e) => setAnnBody(e.target.value)}
            placeholder="Body lines, one per line"
            className="min-h-[56px] text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => addAnnouncement(false)}>
              <Plus className="h-3 w-3" /> Add to deck
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => addAnnouncement(true)}>
              <Megaphone className="h-3 w-3" /> Show now
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
