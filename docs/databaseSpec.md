Rough draft of the database columns. Should be a prisma schema and pushed to the supabase remotely





-> model UserInfo {
  userId         BigInt   @id @default(autoincrement())
  planId 	
  clerkId        String   @unique @db.VarChar
  firstName      String?  @db.VarChar
  lastName       String?  @db.VarChar
  email          String?  @db.VarChar
  createdAt      DateTime @default(now()) @db.Timestamp(6)
}




Profile info {
	userId
	studentType: enum: new | existing
	Institution: default is 64 (University of Saskatchewan)
	Major (can be multiple)
	minor (same list as majors)
	concentration (Should get concentration based on major selected)
	Goals: text
}


Transcript Info {
	userId
	credit units done
	courses taken
	grades[]
	….

}

Model 

Generated plan {
	userId
	RecommendedCourses
	…..

}

Course {
	courseName
	CreditUnits
	termOffered (list from onboarding flow)
	…..

	IsMulti (if a course is split into more than one term)
}


model GoogleCalendarToken {
  id           BigInt   @id @default(autoincrement())
  clerkId      String   @unique @db.VarChar
  accessToken  String   @db.Text
  refreshToken String?  @db.Text
  expiryDate   BigInt? // ms epoch — matches existing Tokens type
  createdAt    DateTime @default(now()) @db.Timestamp(6)
  updatedAt    DateTime @updatedAt @db.Timestamp(6)

  UserInfo UserInfo @relation(fields: [clerkId], references: [clerkId], onDelete: Cascade)

  @@index([clerkId])
}



model AppleCalendarToken {
  id          BigInt   @id @default(autoincrement())
  clerkId     String   @unique @db.VarChar
  email       String   @db.VarChar
  appPassword String   @db.Text
  connectedAt BigInt // ms epoch — matches existing AppleTokens type
  createdAt   DateTime @default(now()) @db.Timestamp(6)
  updatedAt   DateTime @updatedAt @db.Timestamp(6)

  UserInfo UserInfo @relation(fields: [clerkId], references: [clerkId], onDelete: Cascade)

  @@index([clerkId])
}