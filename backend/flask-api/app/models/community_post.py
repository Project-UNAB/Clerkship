from datetime import timezone

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class CommunityPost(db.Model):
    __tablename__ = "community_posts"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    author_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())

    def to_dict(self, like_count=0, comment_count=0):
        return {
            "id": str(self.id),
            "author_id": str(self.author_id),
            "content": self.content,
            # Naive pero en UTC — marcarla explicita para que el navegador la convierta bien.
            "created_at": self.created_at.replace(tzinfo=timezone.utc).isoformat() if self.created_at else None,
            "like_count": like_count,
            "comment_count": comment_count,
        }
