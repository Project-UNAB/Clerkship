from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class StudentCourse(db.Model):
    __tablename__ = "student_courses"

    student_id = db.Column(UUID(as_uuid=True), db.ForeignKey("students.user_id", ondelete="CASCADE"), primary_key=True)
    course_id = db.Column(UUID(as_uuid=True), db.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)
    enrolled_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        db.UniqueConstraint("student_id", "course_id", name="uq_student_courses_student_course"),
        db.Index("ix_student_courses_student_id", "student_id"),
        db.Index("ix_student_courses_course_id", "course_id"),
    )
