from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class CommunityComment(db.Model):
    __tablename__ = "community_comments"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    post_id = db.Column(UUID(as_uuid=True), db.ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False)
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": str(self.id),
            "post_id": str(self.post_id),
            "author_id": str(self.author_id),
            "content": self.content,
            # Naive pero en UTC — marcarla explicita para que el navegador la convierta bien.
            "created_at": self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None,
        }
