// @ts-nocheck
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GraduationCap, Users, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface NoEnrollmentStateProps {
  showMentorInfo?: boolean
}

export function NoEnrollmentState({ showMentorInfo }: NoEnrollmentStateProps) {
  if (showMentorInfo) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
            <h2 className="text-2xl font-display font-medium mb-4">
              Apprenticeship Dashboard
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              This dashboard is for apprentices and their mentors. You don't currently have 
              any apprentices assigned to you.
            </p>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" asChild>
                <Link href="/guild">
                  <Users className="h-4 w-4 mr-2" />
                  Browse Guild
                </Link>
              </Button>
              <Button asChild>
                <Link href="/team">
                  Manage Team
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card>
        <CardContent className="py-12 text-center">
          <GraduationCap className="h-16 w-16 mx-auto text-international-orange mb-6" />
          <h2 className="text-2xl font-display font-medium mb-4">
            Welcome to the Guild
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            You're not yet enrolled in an apprenticeship programme. Contact your manager 
            or HR team to get started with your formal apprenticeship.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg text-left max-w-sm mx-auto">
              <h3 className="font-medium mb-2">What's next?</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• Speak with your manager about apprenticeship options</li>
                <li>• Choose a programme that matches your career goals</li>
                <li>• Complete your enrolment paperwork</li>
                <li>• Start your learning journey!</li>
              </ul>
            </div>
            <div className="flex gap-4 justify-center">
              <Button variant="outline" asChild>
                <Link href="/marketplace?category=People">
                  Browse Programmes
                </Link>
              </Button>
              <Button asChild>
                <Link href="/guild">
                  Explore the Guild
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
