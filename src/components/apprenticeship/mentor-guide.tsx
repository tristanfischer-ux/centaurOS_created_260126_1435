'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Users,
  Clock,
  Calendar,
  TrendingUp,
  Heart,
  FileCheck,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ListChecks,
  Lightbulb,
  BookOpen,
} from 'lucide-react'

/**
 * Mentor enablement guide with best practices, review templates, and responsibilities.
 *
 * @description Static but structured content that helps mentors understand what
 * makes a great mentor, how to conduct reviews, and what their key
 * responsibilities are. Uses accordion sections for easy scanning.
 */
export function MentorGuide() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-international-orange" />
          Mentor Guide
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Everything you need to be an effective apprenticeship mentor
        </p>
      </div>

      {/* Key Responsibilities Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Your Key Responsibilities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: Clock,
                title: 'Approve OTJT Hours',
                desc: 'Review and approve logged hours within 48 hours',
              },
              {
                icon: Calendar,
                title: 'Conduct Reviews',
                desc: 'Weekly (month 1), fortnightly, then monthly',
              },
              {
                icon: TrendingUp,
                title: 'Assess Skills',
                desc: 'Quarterly skill assessments against the standard',
              },
              {
                icon: AlertCircle,
                title: 'Escalate Risks',
                desc: 'Flag at-risk apprentices to management early',
              },
              {
                icon: FileCheck,
                title: 'Sign Documents',
                desc: 'Co-sign agreements, reviews, and training plans',
              },
              {
                icon: Heart,
                title: 'Pastoral Support',
                desc: 'Check wellbeing, work-life balance, and motivation',
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <Icon className="h-4 w-4 mt-0.5 text-international-orange shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* What Makes a Great Mentor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            What Makes a Great Mentor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="one-to-ones">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Regular 1:1 Meetings
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Consistent, scheduled 1:1 meetings are the foundation of effective mentoring.
                    They create a safe space for the apprentice to ask questions, raise concerns,
                    and receive feedback.
                  </p>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <p className="font-medium text-foreground">Recommended cadence:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li><strong>Month 1:</strong> Weekly 30-minute check-ins</li>
                      <li><strong>Months 2–6:</strong> Fortnightly 30-minute meetings</li>
                      <li><strong>Month 6+:</strong> Fortnightly or monthly, based on need</li>
                    </ul>
                  </div>
                  <p>
                    Never cancel a 1:1 without rescheduling. Consistency builds trust.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="otjt-approval">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Timely OTJT Approval
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Apprentices log their off-the-job training hours for your approval. Prompt
                    review keeps them motivated and ensures compliance.
                  </p>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <p className="font-medium text-foreground">Best practices:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Review pending hours at least twice per week</li>
                      <li>Approve valid entries within 48 hours</li>
                      <li>If you query an entry, explain what&apos;s needed clearly</li>
                      <li>Never reject without giving the reason</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="skills-development">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Skills Development
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Your role is to observe, assess, and develop the apprentice&apos;s skills
                    against the programme standard. This is an ongoing conversation, not just
                    a quarterly tick-box.
                  </p>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <p className="font-medium text-foreground">The Observe–Assess–Develop cycle:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li><strong>Observe:</strong> Watch them work. Pair on tasks. Review their output.</li>
                      <li><strong>Assess:</strong> Rate against the 5-level proficiency scale honestly.</li>
                      <li><strong>Develop:</strong> Set stretch goals. Recommend resources. Give real responsibility.</li>
                    </ul>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pastoral">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  Pastoral Support &amp; Wellbeing
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Apprentices are often early in their careers. They may face imposter syndrome,
                    workload anxiety, or personal challenges. Being approachable matters.
                  </p>
                  <div className="p-3 bg-muted/50 rounded-lg space-y-1">
                    <p className="font-medium text-foreground">Signs to watch for:</p>
                    <ul className="space-y-1 ml-4 list-disc">
                      <li>Sudden drop in OTJT logging or module progress</li>
                      <li>Withdrawal from team interactions</li>
                      <li>Reluctance to ask questions or seek help</li>
                      <li>Missed deadlines without explanation</li>
                    </ul>
                  </div>
                  <p>
                    If you notice these signs, have a private conversation. Ask open questions:
                    &quot;How are you finding things?&quot; rather than &quot;Is everything OK?&quot;
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Review Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Review Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="weekly">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Weekly</Badge>
                  Weekly Check-In (5 Questions)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-xs italic">
                    Use in the first month, or whenever extra support is needed. ~15 minutes.
                  </p>
                  <ol className="space-y-2 ml-4 list-decimal">
                    <li><strong>What did you work on this week?</strong> — Let them summarise their activities.</li>
                    <li><strong>What did you learn?</strong> — Encourage reflection on new skills or knowledge.</li>
                    <li><strong>What was challenging?</strong> — Identify blockers and support needs.</li>
                    <li><strong>Are you on track with OTJT hours?</strong> — Check the numbers together.</li>
                    <li><strong>What&apos;s your focus for next week?</strong> — Align on priorities.</li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="monthly">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="info" className="text-xs">Monthly</Badge>
                  Monthly Progress Review
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-xs italic">
                    Formal progress check. Document outcomes. ~30 minutes.
                  </p>
                  <ol className="space-y-2 ml-4 list-decimal">
                    <li><strong>Module progress review</strong> — Which modules completed? Any blockers?</li>
                    <li><strong>OTJT hours review</strong> — On track? If behind, create a catch-up plan.</li>
                    <li><strong>Skills development update</strong> — Which skills improved? Evidence?</li>
                    <li><strong>Wellbeing check</strong> — How are they feeling about the programme?</li>
                    <li><strong>Goals for next month</strong> — Set 2–3 specific, measurable goals.</li>
                    <li><strong>Any concerns or requests?</strong> — Open the floor.</li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="quarterly">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="warning" className="text-xs">Quarterly</Badge>
                  Quarterly Deep Dive
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="text-xs italic">
                    Comprehensive review aligned with ESFA requirements. ~45–60 minutes.
                  </p>
                  <ol className="space-y-2 ml-4 list-decimal">
                    <li><strong>Programme progress vs timeline</strong> — Are they on track for completion?</li>
                    <li><strong>Full skills assessment</strong> — Rate every skill against the proficiency framework.</li>
                    <li><strong>Evidence portfolio review</strong> — What work samples demonstrate competence?</li>
                    <li><strong>OTJT compliance check</strong> — Maintaining 20% off-the-job?</li>
                    <li><strong>Document status</strong> — All agreements signed and up to date?</li>
                    <li><strong>Career development</strong> — Discuss progression, interests, and aspirations.</li>
                    <li><strong>Action plan</strong> — Document specific actions with deadlines.</li>
                  </ol>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="gateway">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-xs">Gateway</Badge>
                  Gateway Readiness Checklist
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p className="text-xs italic">
                    Complete before recommending the apprentice for End-Point Assessment.
                  </p>
                  <div className="space-y-2">
                    {[
                      'All mandatory learning modules completed',
                      'OTJT hours target met (minimum 20%)',
                      'All required documents signed',
                      'Skills at or above target level for all programme competencies',
                      'Evidence portfolio compiled and reviewed',
                      'Apprentice feels confident and ready for EPA',
                      'Employer satisfied with apprentice performance',
                      'Functional skills (maths & English) at required level',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  )
}
