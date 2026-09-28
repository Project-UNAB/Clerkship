"""
Centralized export of all Request and Response Pydantic schemas for Clerkship API.
"""

from app.schemas.base import (
    BaseSchema,
    DatabaseStatus,
    ErrorResponse,
    HealthResponse,
    validate_body,
)
from app.schemas.auth import (
    AuthTokensResponse,
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    RegisterResponse,
    ResendCodeRequest,
    UpdateAvatarRequest,
    VerifyEmailRequest,
)
from app.schemas.usuarios import (
    StorageUsageResponse,
    UpdateUserRequest,
    UserResponse,
    UserSummary,
)
from app.schemas.cursos import (
    CourseResponse,
    CreateCourseRequest,
    EnrollmentResponse,
)
from app.schemas.articulos import (
    ArticleResponse,
    CreateArticleRequest,
    StudentShelfItem,
    UpdateShelfRequest,
)
from app.schemas.documentos import (
    CreateFolderRequest,
    DocumentFileResponse,
    DocumentFolderResponse,
    UpdateFolderRequest,
    UploadDocumentRequest,
)
from app.schemas.comunidad import (
    CommunityCommentResponse,
    CommunityPostResponse,
    CreateCommentRequest,
    CreatePostRequest,
    LikeResponse,
)
from app.schemas.consultas import (
    ChatMessage,
    ConsultationDetailResponse,
    ConsultationResponse,
    CreateConsultationRequest,
    ExplorarRequest,
    ExplorarResponse,
    FinishConsultationRequest,
    FinishConsultationResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from app.schemas.historial import (
    AiEvaluationSummary,
    FeedbackResponse,
    StudentStatisticsResponse,
)
from app.schemas.email import (
    EmailNotificationResponse,
    EmailStatusResponse,
    SendNotificationRequest,
)
from app.schemas.agentes import (
    CognitiveBias,
    DomainScores,
    EvaluateSessionRequest,
    EvaluationResultResponse,
    GenerateCaseRequest,
    GeneratedCaseResponse,
    GroundTruth,
    PatientChatRequest,
    PatientChatResponse,
    PatientDemographics,
    VitalSigns,
)

__all__ = [
    # Base
    "BaseSchema",
    "DatabaseStatus",
    "ErrorResponse",
    "HealthResponse",
    "validate_body",
    # Auth
    "RegisterRequest",
    "RegisterResponse",
    "VerifyEmailRequest",
    "ResendCodeRequest",
    "LoginRequest",
    "AuthTokensResponse",
    "ChangePasswordRequest",
    "UpdateAvatarRequest",
    "MessageResponse",
    # Usuarios
    "UserResponse",
    "UserSummary",
    "UpdateUserRequest",
    "StorageUsageResponse",
    # Cursos
    "CreateCourseRequest",
    "CourseResponse",
    "EnrollmentResponse",
    # Articulos
    "CreateArticleRequest",
    "ArticleResponse",
    "UpdateShelfRequest",
    "StudentShelfItem",
    # Documentos
    "CreateFolderRequest",
    "UpdateFolderRequest",
    "DocumentFolderResponse",
    "UploadDocumentRequest",
    "DocumentFileResponse",
    # Comunidad
    "CreatePostRequest",
    "CommunityPostResponse",
    "CreateCommentRequest",
    "CommunityCommentResponse",
    "LikeResponse",
    # Consultas
    "CreateConsultationRequest",
    "ConsultationResponse",
    "ChatMessage",
    "SendMessageRequest",
    "SendMessageResponse",
    "ExplorarRequest",
    "ExplorarResponse",
    "ConsultationDetailResponse",
    "FinishConsultationRequest",
    "FinishConsultationResponse",
    # Historial
    "AiEvaluationSummary",
    "FeedbackResponse",
    "StudentStatisticsResponse",
    # Email
    "SendNotificationRequest",
    "EmailStatusResponse",
    "EmailNotificationResponse",
    # Agentes
    "PatientDemographics",
    "VitalSigns",
    "GroundTruth",
    "GenerateCaseRequest",
    "GeneratedCaseResponse",
    "PatientChatRequest",
    "PatientChatResponse",
    "CognitiveBias",
    "DomainScores",
    "EvaluateSessionRequest",
    "EvaluationResultResponse",
]

