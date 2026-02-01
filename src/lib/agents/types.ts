export interface AgentResponse {
    success: boolean;
    content: string;
    metadata?: Record<string, any>;
    error?: string;
}

export interface AgentContext {
    taskId?: string;
    taskTitle: string;
    taskDescription: string;
    objectiveContext?: string;
    userRole?: string;
    userName?: string;
    history?: AgentResponse[];
    additionalData?: Record<string, any>;
}

export interface SpecialistAgent {
    name: string;
    description: string;
    execute: (context: AgentContext) => Promise<AgentResponse>;
}
