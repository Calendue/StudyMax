-- When each course was passed, is being taken or is registered for ("Winter 2027"); nullable, so
-- every existing row and older app build keeps working.
ALTER TABLE "StudentCourse" ADD COLUMN "term" VARCHAR;
